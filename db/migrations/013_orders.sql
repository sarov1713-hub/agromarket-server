ALTER TABLE products ADD COLUMN IF NOT EXISTS stock integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'products'::regclass AND conname = 'products_stock_nonnegative'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_stock_nonnegative CHECK (stock >= 0);
  END IF;
END $$;

-- Keep existing wholesale requests in the orders table.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total numeric(24, 0) CHECK (total >= 0);
ALTER TABLE orders ALTER COLUMN quantity DROP NOT NULL;

CREATE TABLE IF NOT EXISTS order_items (
  order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id integer NOT NULL REFERENCES products(id),
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  price integer NOT NULL CHECK (price >= 0),
  PRIMARY KEY (order_id, product_id)
);

CREATE INDEX IF NOT EXISTS orders_buyer_created_idx
  ON orders (user_id, created_at DESC, id DESC) WHERE address IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items (product_id);
