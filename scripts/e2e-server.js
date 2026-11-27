import '../tests/loadEnv.js';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const target = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)) {
  throw new Error('E2E разрешён только для локальной agromarket_test');
}

execFileSync(process.execPath, [fileURLToPath(new URL('../db/migrate.js', import.meta.url))], { stdio: 'inherit' });

const { pool } = await import('../db/pool.js');
try {
  const { rows: [database] } = await pool.query('SELECT current_database() AS name');
  if (database.name !== 'agromarket_test') throw new Error('E2E ожидает базу agromarket_test');
  await pool.query(
    `INSERT INTO products (name, category, price, stock)
     SELECT 'Товар для E2E ЛР13', 'Тест', 150, 10
     WHERE NOT EXISTS (
       SELECT 1 FROM products WHERE name = 'Товар для E2E ЛР13' AND category = 'Тест'
     )`,
  );
  await pool.query(
    `UPDATE products SET stock = 10 WHERE name = 'Товар для E2E ЛР13' AND category = 'Тест'`,
  );
} catch (error) {
  await pool.end();
  throw error;
}
await import('../server.js');
