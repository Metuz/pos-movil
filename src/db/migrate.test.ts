import { migrate } from './migrate';
import { MIGRATIONS, type Migration } from './migrations';
import { TestDb } from './testing/sqljs-db';

const NOW = '2026-11-21T12:00:00.000Z';
const EXPECTED_TABLES = ['meta', 'outbox', 'products', 'sale_items', 'sales', 'stock_movements'];

let db: TestDb;

beforeEach(async () => {
  db = await TestDb.create();
});

afterEach(() => {
  db.close();
});

function userVersion(): number {
  return db.all<{ user_version: number }>('PRAGMA user_version')[0].user_version;
}

function tableNames(): string[] {
  return db
    .all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .map((row) => row.name);
}

function insertProduct(id: string, barcode: string | null, priceCents = 1000): void {
  db.run(
    'INSERT INTO products (id, barcode, name, price_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, barcode, `Product ${id}`, priceCents, NOW, NOW]
  );
}

function insertSale(id: string, paymentMethod = 'cash'): void {
  db.run('INSERT INTO sales (id, total_cents, payment_method, occurred_at) VALUES (?, ?, ?, ?)', [
    id,
    1000,
    paymentMethod,
    NOW,
  ]);
}

describe('migrate', () => {
  it('Apply migrations in order ', async () => {
    const version = await migrate(db);

    expect(version).toBe(MIGRATIONS.length);
    expect(userVersion()).toBe(MIGRATIONS.length);
    expect(tableNames()).toEqual(EXPECTED_TABLES);
  });

  it('runs twice without fail and keep data', async () => {
    await migrate(db);
    insertProduct('p1', '7501000000001');

    await expect(migrate(db)).resolves.toBe(MIGRATIONS.length);

    expect(userVersion()).toBe(MIGRATIONS.length);
    expect(tableNames()).toEqual(EXPECTED_TABLES);
    expect(db.all('SELECT id FROM products')).toHaveLength(1);
  });

  it('just apply the migrations that are missing', async () => {
    const v1: Migration = { version: 1, name: 'one', sql: 'CREATE TABLE a (id INTEGER);' };
    const v2: Migration = { version: 2, name: 'two', sql: 'CREATE TABLE b (id INTEGER);' };

    await migrate(db, [v1]);
    expect(tableNames()).toEqual(['a']);

    await migrate(db, [v1, v2]);
    expect(tableNames()).toEqual(['a', 'b']);
    expect(userVersion()).toBe(2);
  });

  it('if a migration fail, rollback and keep previous version', async () => {
    const v1: Migration = { version: 1, name: 'one', sql: 'CREATE TABLE a (id INTEGER);' };
    const v2Rota: Migration = {
      version: 2,
      name: 'fail',
      sql: 'CREATE TABLE b (id INTEGER); INSERT INTO tabla_que_no_existe VALUES (1);',
    };

    await expect(migrate(db, [v1, v2Rota])).rejects.toThrow();

    expect(userVersion()).toBe(1);
    expect(tableNames()).toEqual(['a']);
  });

  it('reject DB newest than the app version', async () => {
    db.run('PRAGMA user_version = 99');

    await expect(migrate(db)).rejects.toThrow(/newer than this app supports/);
  });

  it('reject migration with incorrect version', async () => {
    const v1: Migration = { version: 1, name: 'one', sql: 'CREATE TABLE a (id INTEGER);' };
    const v3: Migration = { version: 3, name: 'three', sql: 'CREATE TABLE c (id INTEGER);' };

    await expect(migrate(db, [v1, v3])).rejects.toThrow(/consecutive/);
    expect(userVersion()).toBe(0);
  });
});

describe('schema v1', () => {
  beforeEach(async () => {
    await migrate(db);
  });

  it('not allow two products with the same barcode', () => {
    insertProduct('p1', '7501000000001');

    expect(() => insertProduct('p2', '7501000000001')).toThrow();
  });

  it('allow multiple products without barcode', () => {
    insertProduct('p1', null);
    insertProduct('p2', null);

    expect(db.all('SELECT id FROM products')).toHaveLength(2);
  });

  it('reject negative prices and unknown payment methods', () => {
    expect(() => insertProduct('p1', null, -1)).toThrow();
    expect(() => insertSale('s1', 'bitcoin')).toThrow();
  });

  it('reject negative or zero quantity on sales', () => {
    insertSale('s1');

    expect(() =>
      db.run(
        'INSERT INTO sale_items (id, sale_id, description, unit_price_cents, quantity_milli, line_total_cents) VALUES (?, ?, ?, ?, ?, ?)',
        ['i1', 's1', 'Jam', 18000, 0, 0]
      )
    ).toThrow();
  });

  it('sales accepts product with quantity on decimals', () => {
    insertSale('s1');

    db.run(
      'INSERT INTO sale_items (id, sale_id, product_id, description, unit_price_cents, quantity_milli, line_total_cents) VALUES (?, ?, NULL, ?, ?, ?, ?)',
      ['i1', 's1', 'Jam per kilo', 18000, 350, 6300]
    );

    expect(db.all('SELECT quantity_milli FROM sale_items')).toEqual([{ quantity_milli: 350 }]);
  });

  it('when delate a sale does not delete product', () => {
    insertProduct('p1', '7501000000001');
    insertSale('s1');
    db.run(
      'INSERT INTO sale_items (id, sale_id, product_id, description, unit_price_cents, quantity_milli, line_total_cents) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ['i1', 's1', 'p1', 'Product p1', 1000, 1000, 1000]
    );
    db.run(
      'INSERT INTO stock_movements (id, product_id, sale_id, delta_milli, reason, occurred_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['m1', 'p1', 's1', -1000, 'sale', NOW]
    );

    db.run('DELETE FROM sales WHERE id = ?', ['s1']);

    expect(db.all('SELECT id FROM sale_items')).toHaveLength(0);
    expect(db.all('SELECT id FROM stock_movements')).toHaveLength(0);
    expect(db.all('SELECT id FROM products')).toHaveLength(1);
  });

  it('does not create a sale with unknown product', () => {
    insertSale('s1');

    expect(() =>
      db.run(
        'INSERT INTO sale_items (id, sale_id, product_id, description, unit_price_cents, quantity_milli, line_total_cents) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ['i1', 's1', 'no-existe', 'X', 1000, 1000, 1000]
      )
    ).toThrow();
  });

  it('keeps the order', () => {
    db.run('INSERT INTO outbox (entity_type, entity_id, created_at) VALUES (?, ?, ?)', ['product', 'p1', NOW]);
    db.run('INSERT INTO outbox (entity_type, entity_id, created_at) VALUES (?, ?, ?)', ['sale', 's1', NOW]);

    const rows = db.all<{ entity_type: string }>('SELECT entity_type FROM outbox ORDER BY id');

    expect(rows.map((row) => row.entity_type)).toEqual(['product', 'sale']);
  });
});
