import Database from 'better-sqlite3';
import { mkdir } from 'node:fs/promises';
import { config } from '../src/server/config';
if (config.database) {
  console.error(
    'Use the PostgreSQL backup/restore procedure in docs/deployment.md for DATABASE_URL.',
  );
  process.exit(1);
}
await mkdir('data/backups', { recursive: true });
const source = new Database(config.sqlite, { readonly: true });
const destination = `data/backups/verify-${Date.now()}.sqlite`;
await source.backup(destination);
const restored = new Database(destination, { readonly: true });
const integrity = restored.pragma('integrity_check', { simple: true });
if (integrity !== 'ok') throw new Error('Backup integrity check failed');
for (const table of [
  'workspaces',
  'courses',
  'lessons',
  'lesson_versions',
  'source_snapshots',
  'findings',
]) {
  const before = source.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number };
  const after = restored.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number };
  if (before.n !== after.n) throw new Error(`Restore row-count mismatch: ${table}`);
}
source.close();
restored.close();
console.log('Disposable SQLite backup restored, integrity checked, and six table counts matched.');
