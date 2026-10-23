import { assertTestDatabase } from './testSafety.js';

export function assertSeedAllowed(env = process.env, args = process.argv) {
  // --force не отменяет изоляцию тестовой БД.
  if (env.NODE_ENV === 'test') assertTestDatabase(env);
  let host;
  try { host = new URL(env.DATABASE_URL).hostname; }
  catch { throw new Error('Отказ: некорректная DATABASE_URL'); }
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(host);
  if ((!isLocal || env.NODE_ENV === 'production') && !args.includes('--force')) {
    throw new Error('Отказ: db:init запущен НЕ на локальной базе — все данные будут удалены.\nЕсли база пустая и вы уверены: node db/seed.js --force');
  }
}
