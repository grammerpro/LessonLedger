import Database from 'better-sqlite3';
import {
  CompiledQuery,
  SqliteDialect,
  SqliteDriver,
  type DatabaseConnection,
  type SqliteDialectConfig,
} from 'kysely';
import { setTimeout as delay } from 'node:timers/promises';

class AuthSqliteDriver extends SqliteDriver {
  override async beginTransaction(connection: DatabaseConnection) {
    const deadline = Date.now() + 10000;
    for (;;) {
      try {
        // Reserve the writer before reading a token; a deferred WAL snapshot
        // cannot be upgraded after the worker commits another write.
        await connection.executeQuery(CompiledQuery.raw('begin immediate'));
        return;
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !('code' in error) ||
          error.code !== 'SQLITE_BUSY' ||
          Date.now() >= deadline
        )
          throw error;
        // Let other connections in this process finish their transactions.
        await delay(25);
      }
    }
  }
}

export class AuthSqliteDialect extends SqliteDialect {
  private readonly options: SqliteDialectConfig;

  constructor(filename: string) {
    const database = new Database(filename, { timeout: 100 });
    database.pragma('journal_mode = WAL');
    database.pragma('foreign_keys = ON');
    const options = { database };
    super(options);
    this.options = options;
  }

  override createDriver() {
    return new AuthSqliteDriver(this.options);
  }
}
