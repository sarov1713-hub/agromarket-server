import './loadEnv.js';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertTestDatabase } from '../db/testSafety.js';
import { createHash } from 'node:crypto';

export default async function setup() {
  assertTestDatabase();
  const options = {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: 'inherit',
  };
  // Для удалённой учебной VM нужен --force, но только после assertTestDatabase.
  execSync('npm run db:init -- --force --legacy-schema', options);
  const { pool } = await import('../db/pool.js');
  async function snapshot() {
    const rows = [];
    const tables = {
      users: '*',
      products: 'id, name, category, price, unit, image, created_at',
      orders: 'id, user_id, product_id, name, email, phone, quantity, delivery_date, comment, status, created_at',
    };
    for (const [table, columns] of Object.entries(tables)) {
      rows.push((await pool.query(`SELECT ${columns} FROM ${table} ORDER BY id`)).rows);
    }
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  }
  try {
    await pool.query(
      "INSERT INTO orders (product_id, name, email, quantity) VALUES (1, 'Legacy order', 'legacy@test.kz', 10)",
    );
    const before = await snapshot();
    execSync('npm run db:migrate', options);
    execSync('npm run db:migrate', options);
    if (await snapshot() !== before) throw new Error('Миграция изменила существующие записи');
    console.log('Миграция ×2: существующие записи сохранены');
  } finally {
    await pool.end();
  }
}
