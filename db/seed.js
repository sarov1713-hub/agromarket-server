import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { pool } from './pool.js';
let client;
try {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  const { products } = JSON.parse(await readFile(new URL('../data/db.json', import.meta.url), 'utf8'));
  client = await pool.connect();
  await client.query('BEGIN');
  await client.query(schema);
  for (const product of products) {
    // В исходных данных единица указана только в названии.
    const unit = product.name.endsWith(' л') ? 'л' : 'кг';
    await client.query(
      'INSERT INTO products (name, price, image, unit) VALUES ($1, $2, $3, $4)',
      [product.name, product.price, product.image ?? null, unit],
    );
  }
  await client.query('COMMIT');
  console.log(`База инициализирована. Товаров: ${products.length}`);
} catch (error) {
  if (client) await client.query('ROLLBACK');
  console.error('Не удалось инициализировать БД. Код:', error.code ?? 'unknown');
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
