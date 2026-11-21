import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

import type { MigrationDb } from '../migrate';

let sqlJs: SqlJsStatic | undefined;

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJs) sqlJs = await initSqlJs();
  return sqlJs;
}

export class TestDb implements MigrationDb {
  constructor(private readonly db: Database) {}

  static async create(): Promise<TestDb> {
    const SQL = await loadSqlJs();
    const db = new SQL.Database();
    db.exec('PRAGMA foreign_keys = ON;');
    return new TestDb(db);
  }

  async execAsync(source: string): Promise<void> {
    this.db.exec(source);
  }

  async getFirstAsync<T>(source: string): Promise<T | null> {
    const rows = this.all<T>(source);
    return rows[0] ?? null;
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.db.exec('BEGIN');
    try {
      await task();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  all<T = Record<string, unknown>>(source: string, params: (string | number | null)[] = []): T[] {
    const statement = this.db.prepare(source);
    try {
      statement.bind(params);
      const rows: T[] = [];
      while (statement.step()) rows.push(statement.getAsObject() as T);
      return rows;
    } finally {
      statement.free();
    }
  }

  /** Ejecuta una sentencia con parámetros (INSERT, UPDATE, DELETE). */
  run(source: string, params: (string | number | null)[] = []): void {
    this.db.run(source, params);
  }

  close(): void {
    this.db.close();
  }
}
