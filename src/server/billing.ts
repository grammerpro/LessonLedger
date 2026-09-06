import Stripe from 'stripe';
import type { Knex } from 'knex';
import { db, id, now, unpack, encode, AppError, lockWorkspace } from './db';
import { config } from './config';
import { plans } from '../shared/plans';
import { owner, type Context } from './context';
export const stripe = () =>
  new Stripe(process.env.STRIPE_SECRET_KEY!, { timeout: 15000, maxNetworkRetries: 1 });
export function period() {
  return new Date().toISOString().slice(0, 7);
}
export function resetDate() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}
export function hasAccess(subscription: any) {
  return (
    !!subscription &&
    ['active', 'trialing'].includes(subscription.status) &&
    new Date(subscription.periodEnd).getTime() > Date.now()
  );
}
export async function entitlement(workspace: string, connection: Knex = db) {
  const row = unpack(await connection('workspaces').where({ id: workspace }).first());
  const sub = unpack(await connection('subscriptions').where({ workspace_id: workspace }).first());
  const demo = !!row?.demo && config.demo;
  const plan = sub?.plan === 'studio' ? plans.studio : plans.starter;
  return {
    allowed: demo || hasAccess(sub),
    plan: demo ? { ...plans.studio, checks: 50 } : plan,
    subscription: sub,
  };
}
export async function checkout(ctx: Context, plan: 'starter' | 'studio', portal = false) {
  owner(ctx);
  if (ctx.demo || !config.billing)
    throw new AppError(
      ctx.demo
        ? 'Billing is unavailable in the sample workspace. No payment is needed.'
        : 'Billing is not configured. See the operator setup guide.',
      503,
    );
  const client = stripe();
  let sub = unpack(await db('subscriptions').where({ workspace_id: ctx.workspace }).first());
  if (!sub?.customer_id) {
    const customer = await client.customers.create(
      { email: ctx.email, metadata: { workspaceId: ctx.workspace } },
      { idempotencyKey: `workspace-${ctx.workspace}` },
    );
    await db('subscriptions')
      .insert({
        id: id(),
        workspace_id: ctx.workspace,
        customer_id: customer.id,
        created_at: now(),
        payload: encode({ status: 'incomplete' }),
      })
      .onConflict('workspace_id')
      .ignore();
    sub = unpack(await db('subscriptions').where({ workspace_id: ctx.workspace }).first());
  }
  return db.transaction(async (trx) => {
    await lockWorkspace(trx, ctx.workspace);
    const current = unpack(
      await trx('subscriptions').where({ workspace_id: ctx.workspace }).first(),
    );
    const remote = await client.subscriptions.list({
      customer: current.customer_id,
      status: 'all',
      limit: 100,
    });
    if (
      portal ||
      hasAccess(current) ||
      remote.data.some((s) => ['active', 'trialing', 'past_due', 'unpaid'].includes(s.status))
    ) {
      return (
        await client.billingPortal.sessions.create({
          customer: current.customer_id,
          return_url: `${config.url}/app/settings?tab=billing`,
        })
      ).url;
    }
    if (current.checkoutSessionId) {
      const pending = await client.checkout.sessions.retrieve(current.checkoutSessionId);
      if (pending.status === 'open' && current.checkoutPlan === plan) return pending.url;
      if (pending.status === 'open') await client.checkout.sessions.expire(pending.id);
      if (pending.status === 'complete')
        throw new AppError('Your checkout is being reconciled. Refresh billing shortly.', 409);
    }
    const session = await client.checkout.sessions.create(
      {
        mode: 'subscription',
        customer: current.customer_id,
        line_items: [
          {
            price:
              process.env[
                plan === 'studio' ? 'STRIPE_STUDIO_PRICE_ID' : 'STRIPE_STARTER_PRICE_ID'
              ]!,
            quantity: 1,
          },
        ],
        client_reference_id: ctx.workspace,
        subscription_data: { metadata: { workspaceId: ctx.workspace } },
        success_url: `${config.url}/app/settings?tab=billing`,
        cancel_url: `${config.url}/app/settings?tab=billing`,
      },
      {
        idempotencyKey: `checkout-${ctx.workspace}-${plan}-${current.subscription_id || 'first'}-${current.checkoutSessionId || 'initial'}`,
      },
    );
    await trx('subscriptions')
      .where({ id: current.id })
      .update({
        payload: encode({
          ...JSON.parse(current.payload),
          checkoutSessionId: session.id,
          checkoutPlan: plan,
        }),
      });
    return session.url;
  });
}
export async function applySubscription(
  event: { id: string; created: number },
  subscription: {
    id: string;
    customer: string;
    status: string;
    periodEnd: string;
    price: string;
    cancelAtPeriodEnd: boolean;
  },
) {
  return db.transaction(async (trx) => {
    const record = await trx('subscriptions').where({ customer_id: subscription.customer }).first();
    // Unknown customers include deleted workspaces; acknowledging them cannot grant access.
    if (!record) return;
    await lockWorkspace(trx, record.workspace_id);
    const duplicate = await trx('webhook_receipts').where({ id: event.id }).first();
    if (duplicate) return;
    const current = await trx('subscriptions').where({ id: record.id }).first();
    if (Number(current.event_time) <= event.created) {
      const plan =
        subscription.price === process.env.STRIPE_STUDIO_PRICE_ID
          ? 'studio'
          : subscription.price === process.env.STRIPE_STARTER_PRICE_ID
            ? 'starter'
            : undefined;
      await trx('subscriptions')
        .where({ id: record.id })
        .update({
          subscription_id: subscription.id,
          event_time: event.created,
          payload: encode({
            plan,
            status: plan ? subscription.status : 'unsupported_price',
            periodEnd: subscription.periodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }),
        });
    }
    await trx('webhook_receipts').insert({ id: event.id, created_at: now() });
  });
}
export async function webhook(raw: string, signature: string) {
  if (!config.billing) throw new AppError('Billing is not configured.', 503);
  const client = stripe();
  let event: Stripe.Event;
  try {
    event = client.webhooks.constructEvent(raw, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    throw new AppError('Invalid webhook signature.', 400);
  }
  if (!event.type.startsWith('customer.subscription.')) return;
  const object = event.data.object as Stripe.Subscription;
  // Reconcile against Stripe's current state; delayed events never restore stale access.
  const current = await client.subscriptions.retrieve(object.id);
  const item = current.items.data[0];
  await applySubscription(event, {
    id: current.id,
    customer: typeof current.customer === 'string' ? current.customer : current.customer.id,
    status: current.status,
    periodEnd: new Date(item.current_period_end * 1000).toISOString(),
    price: item.price.id,
    cancelAtPeriodEnd: current.cancel_at_period_end,
  });
}
