import { db } from '../src/server/db';
const row = await db('worker_heartbeats')
  .where({ id: 'worker' })
  .where('updated_at', '>', new Date(Date.now() - 180000).toISOString())
  .first();
await db.destroy();
process.exit(row ? 0 : 1);
