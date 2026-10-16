import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { assertTestDatabase } from '../db/testSafety.js';

const path = fileURLToPath(new URL('../.env.test', import.meta.url));
const { parsed, error } = dotenv.config({ path, override: true, quiet: true });
if (error && (!process.env.CI || error.code !== 'ENOENT')) {
  throw new Error('Не удалось загрузить .env.test. Рабочий .env не используется.');
}
process.env.NODE_ENV = 'test';
assertTestDatabase();
const keys = ['DATABASE_URL', 'JWT_SECRET', 'JWT_EXPIRES_IN', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'CORS_ORIGIN'];
for (const key of keys) {
  if (!process.env[key]) throw new Error(`Не задана тестовая переменная ${key}`);
}
// В CI файла нет: используем только явно переданные job env.
export const testEnv = { ...parsed, NODE_ENV: 'test',
  ...Object.fromEntries(keys.map((key) => [key, process.env[key]])),
};
