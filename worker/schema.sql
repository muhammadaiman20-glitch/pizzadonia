-- Pizzadonia — skema D1.
-- DB dikongsi dengan projek lain, jadi semua nama objek diawali `pizzadonia_`.
CREATE TABLE IF NOT EXISTS pizzadonia_orders (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'baru',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  total          REAL NOT NULL DEFAULT 0,
  phone          TEXT NOT NULL DEFAULT '',
  data           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS pizzadonia_orders_created_idx ON pizzadonia_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS pizzadonia_orders_status_idx ON pizzadonia_orders (status);
