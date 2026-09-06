import { db, id, now, unpack, encode, tenantRow, lockWorkspace } from './db';
import { claimJob, enqueue } from './jobs';
import { safeFetch } from './safe-fetch';
import { hash } from './parse';
import {
  compare,
  sampleCompare,
  fingerprint,
  validateEvidence,
  boundedSegments,
  callCostUpperBound,
} from './evidence';
import { config, validateProduction } from './config';
import { limits } from '../shared/plans';
import { deliverEmail } from './email';
import { deleteBlob } from './storage';

async function guard(run: any) {
  const fresh = await db('check_runs')
    .where({
      id: run.id,
      workspace_id: run.workspace_id,
      status: 'running',
      lease_token: run.lease_token,
    })
    .first();
  if (!fresh || fresh.lease_until < now()) throw new Error('lease-lost');
  return fresh;
}
async function saveRun(run: any, payload: any) {
  const count = await db('check_runs')
    .where({
      id: run.id,
      workspace_id: run.workspace_id,
      status: 'running',
      lease_token: run.lease_token,
    })
    .where('lease_until', '>', now())
    .update({ payload: encode(payload) });
  if (!count) throw new Error('lease-lost');
}
export async function processJob(run: any) {
  const controller = new AbortController();
  const heartbeat = setInterval(async () => {
    try {
      const count = await db('check_runs')
        .where({ id: run.id, status: 'running', lease_token: run.lease_token })
        .where('lease_until', '>', now())
        .update({ lease_until: new Date(Date.now() + 120000).toISOString() });
      if (!count) controller.abort();
      await db('worker_heartbeats')
        .insert({ id: 'worker', updated_at: now() })
        .onConflict('id')
        .merge();
    } catch {
      controller.abort();
    }
  }, 15000);
  let progress = { ...run };
  try {
    const workspace = unpack(await db('workspaces').where({ id: run.workspace_id }).first());
    if (!workspace || workspace.deleting) throw new Error('lease-lost');
    const course = await tenantRow('courses', run.course_id, run.workspace_id);
    const sample = !!workspace.demo && config.demo;
    if (!sample && !config.checks) throw new Error('Checks are not configured');
    const snapshots: any[] = [];
    if (run.snapshotIds)
      for (const snapshotId of run.snapshotIds)
        snapshots.push(await tenantRow('source_snapshots', snapshotId, run.workspace_id));
    else {
      for (const sourceId of run.sourceIds) {
        await guard(run);
        const source = await tenantRow('sources', sourceId, run.workspace_id);
        try {
          let capture: any;
          if (source.provenance === 'fictional sample') {
            if (!sample) throw new Error('Sample sources cannot be processed in live mode');
            capture = { text: source.text, url: source.url };
          } else if (source.provenance === 'manual import')
            capture = { text: source.text, url: source.url };
          else {
            const prior = unpack(
              await db('source_snapshots')
                .where({ source_id: sourceId, workspace_id: run.workspace_id })
                .orderBy('created_at', 'desc')
                .first(),
            );
            capture = await safeFetch(
              source.url,
              prior ? { etag: prior.etag, modified: prior.modified } : undefined,
            );
            if (capture.unchanged && prior) capture = { ...prior, url: source.url };
          }
          await guard(run);
          const snapshot = {
            id: id(),
            workspace_id: run.workspace_id,
            source_id: sourceId,
            created_at: now(),
            payload: encode({
              text: capture.text,
              url: source.url,
              finalUrl: capture.url,
              hash: hash(capture.text),
              etag: capture.etag,
              modified: capture.modified,
              title: source.title,
              provenance: source.provenance,
            }),
          };
          await db('source_snapshots').insert(snapshot);
          snapshots.push(unpack(snapshot));
        } catch {
          progress.warnings.push(
            `${source.title}: unavailable or blocked; this reference was not checked.`,
          );
        }
      }
      progress.snapshotIds = snapshots.map((s) => s.id);
      await saveRun(run, progress);
    }
    for (const versionId of run.versionIds) {
      await guard(run);
      if (
        await db('check_items')
          .where({ check_id: run.id, workspace_id: run.workspace_id, version_id: versionId })
          .first()
      )
        continue;
      const version = await tenantRow('lesson_versions', versionId, run.workspace_id);
      const lesson = await tenantRow('lessons', version.lesson_id, run.workspace_id);
      const segments = boundedSegments(version.segments);
      let covered =
        snapshots.length > 0 &&
        snapshots.length === run.sourceIds.length &&
        encode(segments) === encode(version.segments);
      const findings: any[] = [];
      // Conflicting outputs remain candidates for human review; uncovered inputs never count as clear.
      for (const snapshot of snapshots) {
        await guard(run);
        if (progress.calls >= limits.modelCalls) {
          covered = false;
          continue;
        }
        const cost = sample ? 0 : callCostUpperBound(segments, snapshot.text);
        if (!Number.isFinite(cost) || (progress.reservedUsd || 0) + cost > limits.maxCheckUsd) {
          covered = false;
          continue;
        }
        // Reserve a call durably before contacting a provider. A crash cannot exceed the run budget.
        progress.calls++;
        progress.reservedUsd = (progress.reservedUsd || 0) + cost;
        await saveRun(run, progress);
        const result = sample
          ? { findings: sampleCompare(segments, snapshot.text), inconclusive: false, tokens: 0 }
          : await compare(segments, snapshot.text, course.product, controller.signal);
        if (result.inconclusive) covered = false;
        if (!sample && snapshot.text.length > limits.excerptChars) covered = false;
        progress.tokens += result.tokens;
        for (const candidate of result.findings) {
          const validated = validateEvidence(candidate, segments, snapshot.text);
          if (!validated) {
            covered = false;
            continue;
          }
          findings.push({
            id: id(),
            workspace_id: run.workspace_id,
            check_id: run.id,
            version_id: versionId,
            snapshot_id: snapshot.id,
            fingerprint: fingerprint(lesson.id, validated, snapshot.source_id),
            status: 'open',
            created_at: now(),
            payload: encode({
              ...validated,
              lessonTitle: lesson.title,
              courseId: run.course_id,
              sourceUrl: snapshot.url,
              sourceTitle: snapshot.title || 'Folio product updates',
              capturedAt: snapshot.created_at,
              provenance: snapshot.provenance,
            }),
          });
        }
      }
      await db.transaction(async (trx) => {
        await lockWorkspace(trx, run.workspace_id);
        const validLease = await trx('check_runs')
          .where({
            id: run.id,
            workspace_id: run.workspace_id,
            status: 'running',
            lease_token: run.lease_token,
          })
          .first();
        if (!validLease || validLease.lease_until <= now()) throw new Error('lease-lost');
        let added = 0;
        for (const finding of findings) {
          if (
            await trx('findings')
              .where({ workspace_id: run.workspace_id, fingerprint: finding.fingerprint })
              .first()
          )
            continue;
          await trx('findings').insert(finding);
          added++;
        }
        await trx('check_items').insert({
          id: id(),
          workspace_id: run.workspace_id,
          check_id: run.id,
          version_id: versionId,
          created_at: now(),
          payload: encode({
            covered,
            inconclusive: !covered,
            snapshots: snapshots.map((s) => s.id),
          }),
        });
        progress = {
          ...progress,
          progress: progress.progress + 1,
          covered: progress.covered + (covered ? 1 : 0),
          inconclusive: progress.inconclusive + (covered ? 0 : 1),
          findings: progress.findings + added,
        };
        await trx('check_runs')
          .where({ id: run.id, lease_token: run.lease_token })
          .update({ payload: encode(progress) });
      });
    }
    await db.transaction(async (trx) => {
      await lockWorkspace(trx, run.workspace_id);
      const count = await trx('check_runs')
        .where({ id: run.id, status: 'running', lease_token: run.lease_token })
        .where('lease_until', '>', now())
        .update({
          status: 'completed',
          lease_until: null,
          lease_token: null,
          payload: encode({ ...progress, status: undefined, completedAt: now() }),
        });
      if (!count) throw new Error('lease-lost');
      if (progress.findings > 0 && workspace.notifications && !sample) {
        const owners = await trx('memberships').where({
          workspace_id: run.workspace_id,
          role: 'owner',
        });
        for (const owner of owners) {
          const user = await trx('user').where({ id: owner.user_id }).first();
          if (user)
            await trx('email_deliveries')
              .insert({
                id: id(),
                workspace_id: run.workspace_id,
                created_at: now(),
                delivery_key: `${run.id}-${user.id}`,
                status: 'pending',
                payload: encode({
                  to: user.email,
                  subject: `${progress.findings} lesson updates to review`,
                  text: `${course.title} has ${progress.findings} new findings. Review evidence at ${config.url}/app/review. Checks identify possible changes and do not certify correctness.`,
                }),
              })
              .onConflict('delivery_key')
              .ignore();
        }
      }
    });
  } catch (error) {
    if ((error as Error).message !== 'lease-lost') {
      const fresh = await db('check_runs')
        .where({ id: run.id, lease_token: run.lease_token, status: 'running' })
        .first();
      if (fresh)
        await db('check_runs')
          .where({ id: run.id, lease_token: run.lease_token })
          .update({
            status: run.attempts >= 3 ? 'failed' : 'retrying',
            lease_until: null,
            lease_token: null,
            available_at: new Date(Date.now() + run.attempts * 15000).toISOString(),
            payload: encode({
              ...JSON.parse(fresh.payload),
              error:
                'The check could not finish. It will retry up to three times; completed work is retained.',
            }),
          });
      console.error(
        JSON.stringify({ event: 'check_failed', checkId: run.id, attempt: run.attempts }),
      );
    }
  } finally {
    clearInterval(heartbeat);
  }
}
export async function scheduleTick() {
  const schedules = await db('schedules').where({ enabled: true }).where('next_run', '<=', now());
  for (const schedule of schedules) {
    try {
      await db.transaction(async (trx) => {
        await lockWorkspace(trx, schedule.workspace_id);
        const current = await trx('schedules')
          .where({ id: schedule.id, next_run: schedule.next_run, enabled: true })
          .first();
        if (!current) return;
        const settings = unpack(current);
        await enqueue(schedule.workspace_id, schedule.course_id, trx);
        await trx('schedules')
          .where({ id: schedule.id })
          .update({
            next_run: new Date(Date.now() + settings.days * 86400000).toISOString(),
            payload: encode({ days: settings.days, timezone: settings.timezone, error: null }),
          });
      });
    } catch {
      await db('schedules')
        .where({ id: schedule.id })
        .update({
          next_run: new Date(Date.now() + 3600000).toISOString(),
          payload: encode({
            ...unpack(schedule),
            error: 'Waiting for configuration, available quota, or the current check to finish.',
          }),
        });
    }
  }
}
export async function emailTick() {
  const pending = await db('email_deliveries').where({ status: 'pending' }).limit(10);
  for (const row of pending) {
    const claimed = await db('email_deliveries')
      .where({ id: row.id, status: 'pending' })
      .update({ status: 'sending' });
    if (!claimed) continue;
    const mail = unpack(row);
    try {
      await deliverEmail({
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        key: row.delivery_key,
      });
      await db('email_deliveries').where({ id: row.id }).update({ status: 'sent' });
    } catch {
      await db('email_deliveries').where({ id: row.id }).update({ status: 'uncertain' });
    }
    // Never automatically resend ambiguous SMTP delivery. Operator reviews 'sending'/'uncertain'.
  }
}
export async function cleanupTick() {
  await db('rate_limits').where('reset_at', '<', Date.now()).delete();
  const expired = await db('demo_sessions').where('expires_at', '<', now());
  for (const session of expired) {
    const workspace = await db('workspaces').where({ id: session.workspace_id }).first();
    if (workspace)
      await db('workspaces')
        .where({ id: workspace.id })
        .update({ payload: encode({ ...unpack(workspace), deleting: true }) });
  }
  const workspaces = await db('workspaces');
  for (const row of workspaces) {
    const workspace = unpack(row);
    if (workspace.deleting) {
      await db('check_runs')
        .where({ workspace_id: row.id })
        .whereIn('status', ['queued', 'running', 'retrying'])
        .update({ status: 'canceled', lease_token: null });
      for (const blob of await db('blobs').where({ workspace_id: row.id }))
        await deleteBlob(row.id, blob.id);
      await db('workspaces').where({ id: row.id }).delete();
      continue;
    }
    const cutoff = new Date(Date.now() - (workspace.retentionDays || 90) * 86400000).toISOString();
    for (const blob of await db('blobs')
      .where({ workspace_id: row.id })
      .where('created_at', '<', cutoff))
      await deleteBlob(row.id, blob.id);
    await db('exports').where({ workspace_id: row.id }).where('created_at', '<', cutoff).delete();
  }
}
export async function workerTick() {
  await db('worker_heartbeats')
    .insert({ id: 'worker', updated_at: now() })
    .onConflict('id')
    .merge();
  await scheduleTick();
  await emailTick();
  const job = await claimJob();
  if (job) await processJob(job);
  return !!job;
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/server/worker.ts')) {
  validateProduction();
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });
  console.log(JSON.stringify({ event: 'worker_started' }));
  let ticks = 0;
  while (!stopping) {
    try {
      await workerTick();
      if (ticks++ % 60 === 0) await cleanupTick();
    } catch {
      console.error(JSON.stringify({ event: 'worker_tick_failed' }));
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  await db.destroy();
  process.exit(0);
}
