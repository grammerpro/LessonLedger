import type { Knex } from 'knex';
export async function up(db: Knex) {
  await db.schema.createTable('worker_heartbeats', (t) => {
    t.string('id').primary();
    t.string('updated_at').notNullable();
  });
}
export async function down(db: Knex) {
  await db.schema.dropTableIfExists('worker_heartbeats');
}
