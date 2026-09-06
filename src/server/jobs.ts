import type { Knex } from 'knex';
import { db, id, now, encode, unpack, tenantRow, AppError, lockWorkspace } from './db';
import { entitlement, period } from './billing';
import { config } from './config';
import { limits } from '../shared/plans';

export async function enqueue(workspace: string, courseId: string, connection?: Knex.Transaction) {
  const operation = async (trx: Knex.Transaction) => {
    await lockWorkspace(trx, workspace);
    await tenantRow('courses', courseId, workspace, trx);
    const ws = await trx('workspaces').where({ id: workspace }).first();
    if (unpack(ws).deleting) throw new AppError('Workspace is being deleted.');
    if (!(ws.demo && config.demo) && !config.checks)
      throw new AppError(
        'Checks are not configured. Set OPENAI_API_KEY and OPENAI_MODEL; see docs/setup.md.',
        503,
      );
    const access = await entitlement(workspace, trx);
    if (!access.allowed)
      throw new AppError('An active subscription is required to run checks.', 402);
    const existing = await trx('check_runs')
      .where({ workspace_id: workspace })
      .whereIn('status', ['queued', 'running', 'retrying'])
      .first();
    if (existing)
      throw new AppError('A check is already queued or running in this workspace.', 409);
    const used = Number(
      (
        await trx('usage_entries')
          .where({ workspace_id: workspace, period: period() })
          .count('* as count')
          .first()
      )?.count || 0,
    );
    if (used >= access.plan.checks)
      throw new AppError('This month’s check allowance has been used.', 429);
    const lessons = (
      await trx('lessons').where({ workspace_id: workspace, course_id: courseId })
    ).map(unpack);
    const sources = await trx('sources').where({ workspace_id: workspace, course_id: courseId });
    if (!lessons.length || !sources.length)
      throw new AppError('Import a lesson and add an approved source first.');
    if (lessons.length > limits.checkLessons || sources.length > limits.sources)
      throw new AppError('Each check supports at most 25 lessons and 8 sources.');
    const runId = id();
    const date = now();
    await trx('check_runs').insert({
      id: runId,
      workspace_id: workspace,
      course_id: courseId,
      status: 'queued',
      available_at: date,
      created_at: date,
      payload: encode({
        versionIds: lessons.map((l) => l.versionId),
        sourceIds: sources.map((s) => s.id),
        progress: 0,
        total: lessons.length,
        covered: 0,
        inconclusive: 0,
        findings: 0,
        calls: 0,
        tokens: 0,
        warnings: [],
      }),
    });
    await trx('usage_entries').insert({
      id: id(),
      workspace_id: workspace,
      period: period(),
      check_id: runId,
      created_at: date,
      payload: encode({ units: 1 }),
    });
    return runId;
  };
  return connection ? operation(connection) : db.transaction(operation);
}
export async function claimJob(): Promise<any> {
  const candidate = await db('check_runs')
    .where((builder) =>
      builder
        .whereIn('status', ['queued', 'retrying'])
        .where('available_at', '<=', now())
        .orWhere((sub) => sub.where({ status: 'running' }).where('lease_until', '<', now())),
    )
    .orderBy('created_at')
    .first();
  if (!candidate) return null;
  return db.transaction(async (trx) => {
    await lockWorkspace(trx, candidate.workspace_id);
    const run = await trx('check_runs').where({ id: candidate.id }).first();
    if (
      !run ||
      !(
        ['queued', 'retrying'].includes(run.status) ||
        (run.status === 'running' && run.lease_until < now())
      )
    )
      return null;
    if (run.attempts >= 3) {
      await trx('check_runs')
        .where({ id: run.id })
        .update({
          status: 'failed',
          payload: encode({
            ...unpack(run),
            error: 'Check exhausted three attempts. Review the sources and start a new check.',
          }),
        });
      return null;
    }
    const token = id();
    const until = new Date(Date.now() + 120000).toISOString();
    await trx('check_runs')
      .where({ id: run.id })
      .update({
        status: 'running',
        lease_token: token,
        lease_until: until,
        attempts: run.attempts + 1,
      });
    return { ...unpack(run), status: 'running', lease_token: token, attempts: run.attempts + 1 };
  });
}
export async function cancel(workspace: string, runId: string) {
  await db.transaction(async (trx) => {
    await lockWorkspace(trx, workspace);
    await tenantRow('check_runs', runId, workspace, trx);
    await trx('check_runs')
      .where({ id: runId, workspace_id: workspace })
      .whereIn('status', ['queued', 'running', 'retrying'])
      .update({ status: 'canceled', lease_token: null, lease_until: null });
  });
}
