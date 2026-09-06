import { z } from 'zod';
import { db, id, now, encode, unpack, AppError, tenantRow, lockWorkspace } from './db';
import { type Context, owner, rateLimit } from './context';
import { entitlement, period, resetDate, stripe } from './billing';
import { limits } from '../shared/plans';
import { config } from './config';
import { parseText, hash } from './parse';
import { safeFetch, validateUrl } from './safe-fetch';
import { enqueue } from './jobs';
import type { Segment } from '../shared/types';

export async function state(ctx: Context) {
  const workspace = unpack(await db('workspaces').where({ id: ctx.workspace }).first());
  if (!workspace || workspace.deleting) throw new AppError('This workspace is being deleted.', 410);
  const [
    courses,
    lessons,
    sources,
    findings,
    checks,
    schedules,
    memberships,
    access,
    usage,
    versions,
  ] = await Promise.all([
    db('courses').where({ workspace_id: ctx.workspace }).orderBy('created_at'),
    db('lessons').where({ workspace_id: ctx.workspace }).orderBy('created_at'),
    db('sources').where({ workspace_id: ctx.workspace }).orderBy('created_at'),
    db('findings').where({ workspace_id: ctx.workspace }).orderBy('created_at', 'desc'),
    db('check_runs')
      .where({ workspace_id: ctx.workspace })
      .orderBy('created_at', 'desc')
      .limit(100),
    db('schedules').where({ workspace_id: ctx.workspace }),
    ctx.demo
      ? Promise.resolve([{ id: ctx.workspace, name: workspace.name }])
      : db('memberships')
          .join('workspaces', 'workspaces.id', 'memberships.workspace_id')
          .where({ 'memberships.user_id': ctx.userId })
          .select('workspaces.id', 'workspaces.name'),
    entitlement(ctx.workspace),
    db('usage_entries')
      .where({ workspace_id: ctx.workspace, period: period() })
      .count('* as count')
      .first(),
    db('lesson_versions').where({ workspace_id: ctx.workspace }),
  ]);
  const byVersion = new Map(versions.map((v) => [v.id, unpack(v)]));
  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      demo: !!workspace.demo,
      notifications: workspace.notifications,
      retentionDays: workspace.retentionDays,
      timezone: workspace.timezone,
    },
    user: { name: ctx.name, email: ctx.email, role: ctx.role },
    workspaces: memberships,
    courses: courses.map(unpack),
    lessons: lessons.map((row) => {
      const lesson = unpack(row);
      return { ...lesson, segments: byVersion.get(lesson.versionId)?.segments || [] };
    }),
    sources: sources.map((row) => {
      const source = unpack(row);
      return { ...source, text: undefined, payload: undefined };
    }),
    findings: findings.map(unpack),
    checks: checks.map(unpack),
    schedules: schedules.map(unpack),
    subscription: {
      ...(access.subscription || { status: ctx.demo ? 'sample' : 'unsubscribed', plan: 'starter' }),
      allowed: access.allowed,
      limits: access.plan,
    },
    usage: { used: Number(usage?.count || 0), limit: access.plan.checks, reset: resetDate() },
    configuration: {
      checks: ctx.demo || config.checks,
      billing: config.billing && !ctx.demo,
      email: !!process.env.SMTP_HOST && !ctx.demo,
    },
  };
}
export async function createCourse(ctx: Context, input: unknown) {
  const data = z
    .object({
      title: z.string().trim().min(2).max(100),
      product: z.string().trim().min(2).max(80),
      description: z.string().max(500).default(''),
    })
    .parse(input);
  return db.transaction(async (trx) => {
    await lockWorkspace(trx, ctx.workspace);
    const access = await entitlement(ctx.workspace, trx);
    const count = Number(
      (await trx('courses').where({ workspace_id: ctx.workspace }).count('* as count').first())
        ?.count || 0,
    );
    if (count >= access.plan.courses)
      throw new AppError('Your course limit has been reached.', 429);
    const courseId = id();
    await trx('courses').insert({
      id: courseId,
      workspace_id: ctx.workspace,
      created_at: now(),
      payload: encode({ ...data, color: ['sage', 'sand', 'clay'][count % 3] }),
    });
    return courseId;
  });
}
export async function createLesson(
  ctx: Context,
  data: { courseId: string; title: string; segments: Segment[]; format: string; blobId?: string },
) {
  z.string().trim().min(2).max(150).parse(data.title);
  return db.transaction(async (trx) => {
    await lockWorkspace(trx, ctx.workspace);
    await tenantRow('courses', data.courseId, ctx.workspace, trx);
    const access = await entitlement(ctx.workspace, trx);
    const count = Number(
      (await trx('lessons').where({ workspace_id: ctx.workspace }).count('* as count').first())
        ?.count || 0,
    );
    if (count >= access.plan.lessons)
      throw new AppError('Your lesson limit has been reached.', 429);
    const lessonId = id();
    const versionId = id();
    const date = now();
    await trx('lessons').insert({
      id: lessonId,
      workspace_id: ctx.workspace,
      course_id: data.courseId,
      created_at: date,
      payload: encode({ title: data.title.trim(), versionId, format: data.format }),
    });
    await trx('lesson_versions').insert({
      id: versionId,
      workspace_id: ctx.workspace,
      lesson_id: lessonId,
      created_at: date,
      payload: encode({
        segments: data.segments,
        hash: hash(encode(data.segments)),
        number: 1,
        blobId: data.blobId,
      }),
    });
    return lessonId;
  });
}
export async function createSource(ctx: Context, input: unknown) {
  const data = z
    .object({
      courseId: z.string().uuid(),
      title: z.string().trim().min(2).max(120),
      url: z.string().max(2000),
      text: z.string().max(100000).optional(),
      approved: z.literal(true),
    })
    .parse(input);
  await tenantRow('courses', data.courseId, ctx.workspace);
  const url = validateUrl(data.url);
  if (data.text && data.text.trim().length < 40)
    throw new AppError('Manual source text must contain at least 40 characters.');
  const sampleUrl = url.hostname.endsWith('.example');
  if (sampleUrl && !ctx.demo)
    throw new AppError('Example domains are only available in sample workspaces.');
  if (!data.text && sampleUrl)
    throw new AppError('Paste fictional reference text for a sample source.');
  const fetched = data.text ? undefined : await safeFetch(url.href);
  return db.transaction(async (trx) => {
    await lockWorkspace(trx, ctx.workspace);
    await tenantRow('courses', data.courseId, ctx.workspace, trx);
    const count = Number(
      (
        await trx('sources')
          .where({ workspace_id: ctx.workspace, course_id: data.courseId })
          .count('* as count')
          .first()
      )?.count || 0,
    );
    if (count >= limits.sources) throw new AppError('Each course supports at most eight sources.');
    const sourceId = id();
    const provenance = sampleUrl
      ? 'fictional sample'
      : data.text
        ? 'manual import'
        : 'official URL';
    await trx('sources').insert({
      id: sourceId,
      workspace_id: ctx.workspace,
      course_id: data.courseId,
      created_at: now(),
      payload: encode({
        title: data.title,
        url: url.href,
        text: data.text,
        provenance,
        validated: true,
        approvedBy: ctx.userId,
      }),
    });
    if (fetched)
      await trx('source_snapshots').insert({
        id: id(),
        workspace_id: ctx.workspace,
        source_id: sourceId,
        created_at: now(),
        payload: encode({ ...fetched, hash: hash(fetched.text), provenance, title: data.title }),
      });
    return sourceId;
  });
}
const transitions: Record<string, string[]> = {
  open: ['confirmed', 'dismissed'],
  confirmed: ['resolved', 'open'],
  dismissed: ['open'],
  resolved: ['open'],
};
export async function review(ctx: Context, findingId: string, input: unknown) {
  const data = z
    .object({
      status: z.enum(['open', 'confirmed', 'dismissed', 'resolved']).optional(),
      replacement: z.string().min(12).max(5000).optional(),
      apply: z.boolean().optional(),
    })
    .parse(input);
  return db.transaction(async (trx) => {
    await lockWorkspace(trx, ctx.workspace);
    const finding = await tenantRow('findings', findingId, ctx.workspace, trx);
    if (
      data.status &&
      data.status !== finding.status &&
      !transitions[finding.status]?.includes(data.status)
    )
      throw new AppError('This review transition is not allowed.', 409);
    if (data.apply && finding.status !== 'confirmed')
      throw new AppError('Confirm the finding before applying its draft.');
    const replacement = data.replacement || finding.replacement;
    let checkId: string | undefined;
    if (data.apply) {
      const version = await tenantRow('lesson_versions', finding.version_id, ctx.workspace, trx);
      const lesson = await tenantRow('lessons', version.lesson_id, ctx.workspace, trx);
      if (lesson.versionId !== version.id)
        throw new AppError(
          'The lesson has changed since this finding. Run a new check before applying.',
          409,
        );
      const segments = version.segments.map((segment: Segment) =>
        segment.location === finding.location
          ? { ...segment, text: segment.text.replace(finding.original, replacement) }
          : segment,
      );
      const versionId = id();
      await trx('lesson_versions').insert({
        id: versionId,
        workspace_id: ctx.workspace,
        lesson_id: lesson.id,
        created_at: now(),
        payload: encode({
          segments,
          number: version.number + 1,
          hash: hash(encode(segments)),
          basedOn: version.id,
        }),
      });
      await trx('lessons')
        .where({ id: lesson.id, workspace_id: ctx.workspace })
        .update({ payload: encode({ title: lesson.title, format: lesson.format, versionId }) });
      // Version and recheck reservation commit together; exhausted quotas cannot leave a half-applied edit.
      checkId = await enqueue(ctx.workspace, lesson.course_id, trx);
    }
    const nextStatus = data.status || finding.status;
    await trx('findings')
      .where({ id: findingId, workspace_id: ctx.workspace })
      .update({
        status: nextStatus,
        payload: encode({ ...JSON.parse(finding.payload), replacement }),
      });
    await trx('finding_events').insert({
      id: id(),
      workspace_id: ctx.workspace,
      finding_id: findingId,
      created_at: now(),
      payload: encode({
        actor: ctx.userId,
        from: finding.status,
        to: nextStatus,
        action: data.apply
          ? 'applied draft; recheck queued'
          : data.replacement
            ? 'edited draft'
            : 'changed status',
        replacement,
      }),
    });
    return { checkId };
  });
}
export async function settings(ctx: Context, input: unknown) {
  owner(ctx);
  const data = z
    .object({
      name: z.string().trim().min(2).max(80),
      timezone: z.string().max(80),
      notifications: z.boolean(),
      retentionDays: z.union([z.literal(30), z.literal(90), z.literal(365)]),
    })
    .parse(input);
  try {
    new Intl.DateTimeFormat('en', { timeZone: data.timezone });
  } catch {
    throw new AppError('Choose a valid IANA timezone.');
  }
  await db('workspaces')
    .where({ id: ctx.workspace })
    .update({ name: data.name, payload: encode(data) });
}
export async function schedule(ctx: Context, input: unknown) {
  owner(ctx);
  const data = z
    .object({
      courseId: z.string().uuid(),
      enabled: z.boolean(),
      days: z.union([z.literal(7), z.literal(30)]),
      timezone: z.string().max(80),
    })
    .parse(input);
  try {
    new Intl.DateTimeFormat('en', { timeZone: data.timezone });
  } catch {
    throw new AppError('Choose a valid timezone.');
  }
  await db.transaction(async (trx) => {
    await lockWorkspace(trx, ctx.workspace);
    await tenantRow('courses', data.courseId, ctx.workspace, trx);
    const access = await entitlement(ctx.workspace, trx);
    if (data.enabled && (!access.allowed || (!ctx.demo && !config.checks)))
      throw new AppError(
        'Configure checks and activate a subscription before enabling monitoring.',
      );
    const record = {
      id: id(),
      workspace_id: ctx.workspace,
      course_id: data.courseId,
      enabled: data.enabled,
      next_run: new Date(Date.now() + data.days * 86400000).toISOString(),
      created_at: now(),
      payload: encode({ days: data.days, timezone: data.timezone }),
    };
    await trx('schedules')
      .insert(record)
      .onConflict(['workspace_id', 'course_id'])
      .merge(['enabled', 'next_run', 'payload']);
  });
}
export async function deleteWorkspace(ctx: Context) {
  owner(ctx);
  await db.transaction(async (trx) => {
    await lockWorkspace(trx, ctx.workspace);
    const subscription = unpack(
      await trx('subscriptions').where({ workspace_id: ctx.workspace }).first(),
    );
    if (subscription?.checkoutSessionId && !ctx.demo) {
      const pending = await stripe().checkout.sessions.retrieve(subscription.checkoutSessionId);
      if (pending.status === 'complete' && !subscription.subscription_id)
        throw new AppError(
          'Your completed checkout is being reconciled. Refresh billing before deleting the workspace.',
          409,
        );
      if (pending.status === 'open') await stripe().checkout.sessions.expire(pending.id);
    }
    if (
      subscription &&
      !['canceled', 'incomplete_expired', 'incomplete'].includes(subscription.status) &&
      !subscription.cancelAtPeriodEnd
    ) {
      throw new AppError(
        'Cancel your subscription in the billing portal before deleting this workspace. This prevents future renewal charges.',
        409,
      );
    }
    const workspace = unpack(await trx('workspaces').where({ id: ctx.workspace }).first());
    await trx('check_runs')
      .where({ workspace_id: ctx.workspace })
      .whereIn('status', ['queued', 'running', 'retrying'])
      .update({ status: 'canceled', lease_token: null });
    await trx('schedules').where({ workspace_id: ctx.workspace }).update({ enabled: false });
    await trx('workspaces')
      .where({ id: ctx.workspace })
      .update({ payload: encode({ ...JSON.parse(workspace.payload), deleting: true }) });
  });
}
export async function pastedLesson(ctx: Context, input: unknown) {
  await rateLimit(`${ctx.workspace}:upload`, 15);
  const data = z
    .object({
      courseId: z.string().uuid(),
      title: z.string().min(2).max(150),
      text: z.string().max(limits.textChars),
      format: z.enum(['txt', 'md', 'srt', 'vtt']).default('txt'),
    })
    .parse(input);
  return createLesson(ctx, { ...data, segments: parseText(data.text, data.format) });
}
