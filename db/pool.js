import pg from 'pg';
import { assertTestDatabase } from './testSafety.js';

if (process.env.NODE_ENV === 'test') assertTestDatabase();

pg.types.setTypeParser(1082, (value) => value);

if (!process.env.DATABASE_URL) {
  throw new Error('Не задана переменная DATABASE_URL');
}

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL: соединение потеряно —', err.message);
});