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
  execSync('npm run db:init -- --force', options);
  const { pool } = await import('../db/pool.js');
  async function snapshot() {
    const rows = [];
    for (const table of ['users', 'products', 'orders']) {
      rows.push((await pool.query(`SELECT * FROM ${table} ORDER BY id`)).rows);
    }
    return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  }
  try {
    const before = await snapshot();
    execSync('npm run db:migrate', options);
    execSync('npm run db:migrate', options);
    if (await snapshot() !== before) throw new Error('Миграция изменила существующие записи');
    console.log('Миграция ×2: существующие записи сохранены');
  } finally {
    await pool.end();
  }
}
