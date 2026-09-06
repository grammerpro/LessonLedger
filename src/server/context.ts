import { getAuth } from './auth';
import { db, AppError, id, now, encode, unpack } from './db';
import { config } from './config';
import { hash } from './parse';
export type Context = {
  workspace: string;
  userId: string;
  name: string;
  email: string;
  role: 'owner' | 'editor';
  demo: boolean;
};
export function cookie(request: Request, name: string) {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
export async function context(request: Request): Promise<Context> {
  const token = cookie(request, 'll_sample');
  if (config.demo && token) {
    const session = await db('demo_sessions')
      .where({ id: hash(token) })
      .where('expires_at', '>', now())
      .first();
    if (session)
      return {
        workspace: session.workspace_id,
        userId: `sample-${session.workspace_id}`,
        name: 'Alex',
        email: '',
        role: 'owner',
        demo: true,
      };
  }
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) throw new AppError('Sign in to continue.', 401);
  let membership = await db('memberships')
    .where({ user_id: session.user.id })
    .orderBy('id')
    .first();
  if (!membership) {
    await db.transaction(async (trx) => {
      // Auth user row write serializes first-workspace creation across requests.
      await trx('user').where({ id: session.user.id }).update({ name: session.user.name });
      membership = await trx('memberships').where({ user_id: session.user.id }).first();
      if (membership) return;
      const workspace = id();
      const date = now();
      await trx('workspaces').insert({
        id: workspace,
        name: `${session.user.name || 'My'} workspace`,
        demo: false,
        created_at: date,
        touched_at: date,
        payload: encode({ notifications: true, retentionDays: 90, timezone: 'UTC' }),
      });
      membership = { id: id(), user_id: session.user.id, workspace_id: workspace, role: 'owner' };
      await trx('memberships').insert(membership);
    });
  }
  const selected = cookie(request, 'll_workspace');
  if (selected) {
    const allowed = await db('memberships')
      .where({ user_id: session.user.id, workspace_id: selected })
      .first();
    if (allowed) membership = allowed;
  }
  const workspace = unpack(await db('workspaces').where({ id: membership.workspace_id }).first());
  if (!workspace || workspace.deleting) throw new AppError('Workspace is being deleted.', 410);
  return {
    workspace: membership.workspace_id,
    userId: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: membership.role,
    demo: false,
  };
}
export function owner(ctx: Context) {
  if (ctx.role !== 'owner')
    throw new AppError('Only the workspace owner can perform this action.', 403);
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(config.url).origin)
    throw new AppError('Request origin is not allowed.', 403);
}
export async function rateLimit(key: string, maximum: number, seconds = 60) {
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const keyId = hash(`${key}:${bucket}`);
  await db('rate_limits')
    .insert({ id: keyId, count: 0, reset_at: (bucket + 1) * seconds * 1000 })
    .onConflict('id')
    .ignore();
  const result = await db('rate_limits')
    .where({ id: keyId })
    .where('count', '<', maximum)
    .increment('count', 1);
  if (!result) throw new AppError('Too many requests. Please try again shortly.', 429);
}
