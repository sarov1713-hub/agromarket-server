import pg from 'pg';
pg.types.setTypeParser(1082, (value) => value);
if (!process.env.DATABASE_URL) throw new Error('Не задана переменная DATABASE_URL');
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
pool.on('error', () => console.error('Соединение с PostgreSQL потеряно'));
