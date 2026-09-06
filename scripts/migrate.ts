import { db } from '../src/server/db';
import { getAuth } from '../src/server/auth';
import { getMigrations } from 'better-auth/db/migration';
import { up, down } from '../migrations/001_initial';
import { up as healthUp, down as healthDown } from '../migrations/002_worker_health';
export async function migrate() {
  await db.migrate.latest({
    migrationSource: {
      getMigrations: async () => ['001_initial', '002_worker_health'],
      getMigrationName: (m: string) => m,
      getMigration: async (m: string) =>
        m === '001_initial' ? { up, down } : { up: healthUp, down: healthDown },
    },
  });
  const migration = await getMigrations(getAuth().options);
  await migration.runMigrations();
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/scripts/migrate.ts')) {
  await migrate();
  console.log('Database migrations applied.');
  await db.destroy();
  process.exit(0);
}
