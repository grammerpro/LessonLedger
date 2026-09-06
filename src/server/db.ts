import knex, { type Knex } from 'knex';
import { config } from './config';
const globals = globalThis as unknown as { ledgerDb?: Knex };
export const db: Knex =
  globals.ledgerDb ??
  knex(
    config.database
      ? {
          client: 'pg',
          connection: config.database,
          pool: { min: 0, max: 8 },
        }
      : {
          client: 'better-sqlite3',
          connection: { filename: config.sqlite },
          useNullAsDefault: true,
          pool: {
            min: 1,
            max: 1,
            afterCreate(connection: any, done: any) {
              connection.pragma('journal_mode = WAL');
              connection.pragma('foreign_keys = ON');
              connection.pragma('busy_timeout = 10000');
              done(null, connection);
            },
          },
        },
  );
globals.ledgerDb = db;
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export function unpack(row: any): any {
  return row ? { ...JSON.parse(row.payload || '{}'), ...row } : row;
}
export const encode = (data: unknown) => JSON.stringify(data);
export async function tenantRow(table: string, rowId: string, workspace: string, connection = db) {
  const row = await connection(table).where({ id: rowId, workspace_id: workspace }).first();
  if (!row) throw new AppError('This item is unavailable in your workspace.', 404);
  return unpack(row);
}
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function lockWorkspace(trx: Knex.Transaction, workspace: string) {
  // A real write obtains SQLite's writer lock; PostgreSQL serializes on this row.
  const count = await trx('workspaces').where({ id: workspace }).update({ touched_at: now() });
  if (!count) throw new AppError('Workspace no longer exists.', 404);
}
