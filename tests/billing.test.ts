import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
const fake = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fixture';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fixture';
  process.env.STRIPE_STARTER_PRICE_ID = 'price_starter';
  process.env.STRIPE_STUDIO_PRICE_ID = 'price_studio';
  return {
    customers: { create: vi.fn() },
    subscriptions: { list: vi.fn() },
    billingPortal: { sessions: { create: vi.fn() } },
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() } },
  };
});
vi.mock('stripe', () => ({
  default: class {
    customers = fake.customers;
    subscriptions = fake.subscriptions;
    billingPortal = fake.billingPortal;
    checkout = fake.checkout;
  },
}));
import { migrate } from '../scripts/migrate';
import { db, id, now, encode, unpack } from '../src/server/db';
import { createSample } from '../src/server/demo';
import { checkout } from '../src/server/billing';
import { deleteWorkspace } from '../src/server/services';
import type { Context } from '../src/server/context';
beforeAll(async () => {
  await migrate();
  await db('workspaces').delete();
});
afterAll(async () => {
  await db.destroy();
});
beforeEach(() => {
  vi.clearAllMocks();
  fake.subscriptions.list.mockResolvedValue({ data: [] });
  fake.checkout.sessions.create.mockResolvedValue({
    id: 'cs_fixture',
    url: 'https://checkout.stripe.com/fixture',
  });
  fake.checkout.sessions.retrieve.mockResolvedValue({
    id: 'cs_fixture',
    status: 'open',
    url: 'https://checkout.stripe.com/fixture',
  });
  fake.billingPortal.sessions.create.mockResolvedValue({
    url: 'https://billing.stripe.com/fixture',
  });
});
async function setup() {
  const workspace = await createSample();
  const context: Context = {
    workspace,
    userId: 'owner',
    name: 'Owner',
    email: 'owner@example.test',
    role: 'owner',
    demo: false,
  };
  await db('subscriptions').insert({
    id: id(),
    workspace_id: workspace,
    customer_id: `cus_${workspace}`,
    created_at: now(),
    payload: encode({ status: 'incomplete' }),
  });
  return context;
}
describe('checkout and deletion safety', () => {
  it('reuses a pending session under concurrent requests', async () => {
    const ctx = await setup();
    const result = await Promise.all([
      checkout(ctx, 'starter'),
      checkout(ctx, 'starter'),
      checkout(ctx, 'starter'),
    ]);
    expect(new Set(result).size).toBe(1);
    expect(fake.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(fake.checkout.sessions.create.mock.calls[0][1].idempotencyKey).toContain(ctx.workspace);
  });
  it('sends a remotely active customer to the portal even before a webhook arrives', async () => {
    const ctx = await setup();
    fake.subscriptions.list.mockResolvedValue({ data: [{ status: 'active' }] });
    expect(await checkout(ctx, 'studio')).toBe('https://billing.stripe.com/fixture');
    expect(fake.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it('expires a previous open session before changing the requested plan', async () => {
    const ctx = await setup();
    await checkout(ctx, 'starter');
    await checkout(ctx, 'studio');
    expect(fake.checkout.sessions.expire).toHaveBeenCalledWith('cs_fixture');
    expect(fake.checkout.sessions.create).toHaveBeenCalledTimes(2);
    const saved = unpack(await db('subscriptions').where({ workspace_id: ctx.workspace }).first());
    expect(saved.checkoutPlan).toBe('studio');
  });
  it('does not create another session while completed checkout awaits reconciliation', async () => {
    const ctx = await setup();
    await checkout(ctx, 'starter');
    fake.checkout.sessions.retrieve.mockResolvedValue({ id: 'cs_fixture', status: 'complete' });
    await expect(checkout(ctx, 'starter')).rejects.toThrow('reconciled');
    expect(fake.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });
  it('protects owner-only billing and does not allow sample checkout', async () => {
    const ctx = await setup();
    await expect(checkout({ ...ctx, role: 'editor' }, 'starter')).rejects.toMatchObject({
      status: 403,
    });
    await expect(checkout({ ...ctx, demo: true }, 'starter')).rejects.toMatchObject({
      status: 503,
    });
    expect(fake.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it('requires cancellation before a workspace can lose its billing controls', async () => {
    const ctx = await setup();
    await db('subscriptions')
      .where({ workspace_id: ctx.workspace })
      .update({ payload: encode({ status: 'active', cancelAtPeriodEnd: false }) });
    await expect(deleteWorkspace(ctx)).rejects.toThrow('Cancel your subscription');
    await db('subscriptions')
      .where({ workspace_id: ctx.workspace })
      .update({ payload: encode({ status: 'active', cancelAtPeriodEnd: true }) });
    await deleteWorkspace(ctx);
    expect(unpack(await db('workspaces').where({ id: ctx.workspace }).first()).deleting).toBe(true);
  });
});
