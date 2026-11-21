import { MIGRATIONS, type Migration } from './migrations';

export interface MigrationDb {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

function assertValidMigrations(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    const expected = index + 1;
    if (migration.version !== expected) {
      throw new Error(
        `The migrations should be consecutive from 1: is expected version ${expected} and found ${migration.version}.`
      );
    }
  });
}
export async function migrate(
  db: MigrationDb,
  migrations: readonly Migration[] = MIGRATIONS
): Promise<number> {
  assertValidMigrations(migrations);
  const latest = migrations.length;

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  if (current > latest) {
    throw new Error(
      `DB is a newest version (${current}) for this app (${latest}). Update app.`
    );
  }

  for (const migration of migrations.slice(current)) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.sql);
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }

  return latest;
}
