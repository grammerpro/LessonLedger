import { afterEach, beforeEach, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { Kysely, sql } from 'kysely';
import { mkdtemp, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { AuthSqliteDialect } from '../src/server/auth-sqlite';

let directory: string;
let authDb: Kysely<{ tokens: { id: number; used: number } }>;
let writer: Database.Database;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'lessonledger-auth-test-'));
  const filename = join(directory, 'auth.sqlite');
  authDb = new Kysely({ dialect: new AuthSqliteDialect(filename) });
  await sql`CREATE TABLE tokens (id INTEGER PRIMARY KEY, used INTEGER NOT NULL)`.execute(authDb);
  await authDb.insertInto('tokens').values({ id: 1, used: 0 }).execute();
  writer = new Database(filename, { timeout: 0 });
});

afterEach(async () => {
  writer.close();
  await authDb.destroy();
  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith('lessonledger-auth-test-')
  )
    throw new Error('Refusing cleanup outside the disposable test directory.');
  await rm(directory, { recursive: true, force: true });
});

it('reserves the writer before reading and preserves rollback', async () => {
  await expect(
    authDb.transaction().execute(async (trx) => {
      expect((await trx.selectFrom('tokens').selectAll().executeTakeFirstOrThrow()).used).toBe(0);
      expect(() => writer.prepare('UPDATE tokens SET used = 1').run()).toThrow('locked');
      await trx.updateTable('tokens').set({ used: 1 }).execute();
      throw new Error('rollback fixture');
    }),
  ).rejects.toThrow('rollback fixture');
  expect(writer.prepare('SELECT used FROM tokens').get()).toEqual({ used: 0 });
});

it('waits asynchronously for a competing writer before starting authentication', async () => {
  writer.exec('BEGIN IMMEDIATE');
  writer.prepare('UPDATE tokens SET used = 1').run();
  const release = setTimeout(() => writer.exec('COMMIT'), 25);
  try {
    await authDb.transaction().execute(async (trx) => {
      expect((await trx.selectFrom('tokens').selectAll().executeTakeFirstOrThrow()).used).toBe(1);
      await trx.updateTable('tokens').set({ used: 2 }).execute();
    });
  } finally {
    clearTimeout(release);
    if (writer.inTransaction) writer.exec('ROLLBACK');
  }
  expect(writer.prepare('SELECT used FROM tokens').get()).toEqual({ used: 2 });
});
