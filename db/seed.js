import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { readFile } from 'node:fs/promises';
import { pool } from './pool.js';
let client;
try {
  if (!process.env.ADMIN_EMAIL?.trim() || !process.env.ADMIN_PASSWORD ||
      process.env.ADMIN_PASSWORD.length < 8 || Buffer.byteLength(process.env.ADMIN_PASSWORD) > 72) {
    throw new Error('Настройте ADMIN_EMAIL и ADMIN_PASSWORD (8 символов, максимум 72 байта)');
  }
  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
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
  await client.query(
    "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')",
    ['Администратор', process.env.ADMIN_EMAIL.trim().toLowerCase(), hash],
  );
  await client.query('COMMIT');
  console.log('Администратор создан; пароль сохранён как bcrypt hash');
  console.log(`База инициализирована. Товаров: ${products.length}`);
} catch (error) {
  if (client) await client.query('ROLLBACK');
  console.error('Не удалось инициализировать БД. Код:', error.code ?? 'unknown');
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
