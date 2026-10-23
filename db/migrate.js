import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from './pool.js';

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    price INTEGER NOT NULL CHECK (price >= 0),
    unit TEXT NOT NULL DEFAULT 'кг',
    image TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    quantity INTEGER NOT NULL CHECK (quantity >= 10),
    delivery_date DATE,
    comment TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'processing', 'done', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
];

let client;
try {
  client = await pool.connect();
  await client.query('BEGIN');
  for (const sql of statements) await client.query(sql);
  let count = statements.length;
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    if (!process.env.ADMIN_EMAIL.trim() || process.env.ADMIN_PASSWORD.length < 8 ||
        Buffer.byteLength(process.env.ADMIN_PASSWORD) > 72) {
      throw new Error('Некорректные параметры администратора');
    }
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    await client.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin') ON CONFLICT (email) DO NOTHING`,
      ['Администратор', process.env.ADMIN_EMAIL.trim().toLowerCase(), hash],
    );
    count++;
  }
  await client.query('COMMIT');
  console.log(`Миграция выполнена (инструкций: ${count})`);
} catch (error) {
  if (client) await client.query('ROLLBACK');
  console.error(`Миграция не удалась: ${error.code || 'проверьте настройки и доступность БД'}`);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
