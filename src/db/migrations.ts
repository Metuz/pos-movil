export type Migration = {
  version: number;
  name: string;
  sql: string;
};

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'Initial schema',
    sql: `
      CREATE TABLE products (
        id TEXT PRIMARY KEY NOT NULL,
        barcode TEXT,
        name TEXT NOT NULL,
        price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
        quick_access INTEGER NOT NULL DEFAULT 0 CHECK (quick_access IN (0, 1)),
        reference_product_id TEXT,
        server_stock_milli INTEGER NOT NULL DEFAULT 0,
        archived_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX products_barcode_unique ON products (barcode) WHERE barcode IS NOT NULL;

      CREATE TABLE sales (
        id TEXT PRIMARY KEY NOT NULL,
        total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'transfer')),
        status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'voided')),
        user_id TEXT,
        occurred_at TEXT NOT NULL,
        voided_at TEXT,
        synced_at TEXT
      );
      CREATE INDEX sales_occurred_at_idx ON sales (occurred_at);
      CREATE INDEX sales_synced_at_idx ON sales (synced_at);

      CREATE TABLE sale_items (
        id TEXT PRIMARY KEY NOT NULL,
        sale_id TEXT NOT NULL REFERENCES sales (id) ON DELETE CASCADE,
        product_id TEXT REFERENCES products (id),
        description TEXT NOT NULL,
        unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
        quantity_milli INTEGER NOT NULL CHECK (quantity_milli > 0),
        line_total_cents INTEGER NOT NULL CHECK (line_total_cents >= 0)
      );
      CREATE INDEX sale_items_sale_id_idx ON sale_items (sale_id);

      CREATE TABLE stock_movements (
        id TEXT PRIMARY KEY NOT NULL,
        product_id TEXT NOT NULL REFERENCES products (id),
        sale_id TEXT REFERENCES sales (id) ON DELETE CASCADE,
        delta_milli INTEGER NOT NULL CHECK (delta_milli <> 0),
        reason TEXT NOT NULL CHECK (reason IN ('sale', 'void', 'adjustment')),
        occurred_at TEXT NOT NULL,
        synced_at TEXT
      );
      CREATE INDEX stock_movements_product_id_idx ON stock_movements (product_id);
      CREATE INDEX stock_movements_sale_id_idx ON stock_movements (sale_id);

      CREATE TABLE outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'sale', 'stock_movement', 'sale_void')),
        entity_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_error TEXT
      );
      CREATE INDEX outbox_entity_idx ON outbox (entity_type, entity_id);

      CREATE TABLE meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      `,
  },
];
