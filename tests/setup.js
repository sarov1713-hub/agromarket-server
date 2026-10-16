import { afterAll } from 'vitest';
import { assertTestDatabase } from '../db/testSafety.js';
import { pool } from '../db/pool.js';

assertTestDatabase();
// isolate + forks: каждый файл получает свой Pool; открытые соединения закрываются.
afterAll(async () => {
  await pool.end();
});
