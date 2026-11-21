import type { SQLiteDatabase } from 'expo-sqlite';

import { migrate } from './migrate';

export async function initDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await migrate(db);
}
