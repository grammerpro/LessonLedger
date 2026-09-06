import type { Knex } from 'knex';

export async function up(db: Knex) {
  await db.schema.createTable('workspaces', (t) => {
    t.string('id').primary();
    t.string('name').notNullable();
    t.boolean('demo').notNullable().defaultTo(false);
    t.text('payload').notNullable().defaultTo('{}');
    t.string('created_at').notNullable();
    t.string('touched_at').notNullable();
  });
  await db.schema.createTable('memberships', (t) => {
    t.string('id').primary();
    t.string('user_id').notNullable();
    t.string('workspace_id')
      .notNullable()
      .references('id')
      .inTable('workspaces')
      .onDelete('CASCADE');
    t.string('role').notNullable();
    t.unique(['user_id', 'workspace_id']);
  });
  await db.schema.createTable('demo_sessions', (t) => {
    t.string('id').primary();
    t.string('workspace_id')
      .notNullable()
      .references('id')
      .inTable('workspaces')
      .onDelete('CASCADE');
    t.string('expires_at').notNullable();
  });
  const entities = [
    'courses',
    'lessons',
    'lesson_versions',
    'sources',
    'source_snapshots',
    'check_runs',
    'check_items',
    'findings',
    'finding_events',
    'exports',
    'subscriptions',
    'usage_entries',
    'email_deliveries',
    'blobs',
    'schedules',
  ];
  for (const name of entities)
    await db.schema.createTable(name, (t) => {
      t.string('id').primary();
      t.string('workspace_id')
        .notNullable()
        .references('id')
        .inTable('workspaces')
        .onDelete('CASCADE');
      t.text('payload').notNullable().defaultTo('{}');
      t.string('created_at').notNullable();
      t.unique(['id', 'workspace_id']);
      t.index(['workspace_id', 'created_at']);
      if (['lessons', 'sources', 'check_runs', 'schedules'].includes(name)) {
        t.string('course_id').notNullable();
        t.foreign(['course_id', 'workspace_id'])
          .references(['id', 'workspace_id'])
          .inTable('courses')
          .onDelete('CASCADE');
      }
      if (name === 'lesson_versions') {
        t.string('lesson_id').notNullable();
        t.foreign(['lesson_id', 'workspace_id'])
          .references(['id', 'workspace_id'])
          .inTable('lessons')
          .onDelete('CASCADE');
      }
      if (name === 'source_snapshots') {
        t.string('source_id').notNullable();
        t.foreign(['source_id', 'workspace_id'])
          .references(['id', 'workspace_id'])
          .inTable('sources')
          .onDelete('CASCADE');
      }
      if (name === 'check_runs') {
        t.string('status').notNullable();
        t.string('lease_token');
        t.string('lease_until');
        t.string('available_at').notNullable();
        t.integer('attempts').notNullable().defaultTo(0);
        t.index(['status', 'available_at']);
      }
      if (['check_items', 'findings'].includes(name)) {
        t.string('check_id').notNullable();
        t.foreign(['check_id', 'workspace_id'])
          .references(['id', 'workspace_id'])
          .inTable('check_runs')
          .onDelete('CASCADE');
        t.string('version_id').notNullable();
        t.foreign(['version_id', 'workspace_id'])
          .references(['id', 'workspace_id'])
          .inTable('lesson_versions')
          .onDelete('CASCADE');
      }
      if (name === 'findings') {
        t.string('snapshot_id').notNullable();
        t.foreign(['snapshot_id', 'workspace_id'])
          .references(['id', 'workspace_id'])
          .inTable('source_snapshots')
          .onDelete('CASCADE');
        t.string('fingerprint').notNullable();
        t.string('status').notNullable().defaultTo('open');
        t.unique(['workspace_id', 'fingerprint']);
      }
      if (name === 'finding_events') {
        t.string('finding_id').notNullable();
        t.foreign(['finding_id', 'workspace_id'])
          .references(['id', 'workspace_id'])
          .inTable('findings')
          .onDelete('CASCADE');
      }
      if (name === 'subscriptions') {
        t.string('customer_id').unique();
        t.string('subscription_id').unique();
        t.unique(['workspace_id']);
        t.bigInteger('event_time').defaultTo(0);
      }
      if (name === 'usage_entries') {
        t.string('period').notNullable();
        t.string('check_id').notNullable().unique();
        t.index(['workspace_id', 'period']);
      }
      if (name === 'email_deliveries') {
        t.string('delivery_key').notNullable().unique();
        t.string('status').notNullable();
      }
      if (name === 'schedules') {
        t.string('next_run').notNullable();
        t.boolean('enabled').notNullable();
        t.unique(['workspace_id', 'course_id']);
      }
    });
  await db.schema.createTable('webhook_receipts', (t) => {
    t.string('id').primary();
    t.string('created_at').notNullable();
  });
  await db.schema.createTable('rate_limits', (t) => {
    t.string('id').primary();
    t.integer('count').notNullable();
    t.bigInteger('reset_at').notNullable();
  });
}
export async function down(db: Knex) {
  for (const name of [
    'rate_limits',
    'webhook_receipts',
    'schedules',
    'blobs',
    'email_deliveries',
    'usage_entries',
    'subscriptions',
    'exports',
    'finding_events',
    'findings',
    'check_items',
    'check_runs',
    'source_snapshots',
    'sources',
    'lesson_versions',
    'lessons',
    'courses',
    'demo_sessions',
    'memberships',
    'workspaces',
  ])
    await db.schema.dropTableIfExists(name);
}
