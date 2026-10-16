// Проверяем имя базы, а не вхождение "test" в пароль/hostname.
export function assertTestDatabase(env = process.env) {
  const target = env.DATABASE_URL || env.PGDATABASE || '';
  const fail = () => { throw new Error('Тесты должны работать с тестовой базой! Проверьте .env.test'); };
  if (!target.includes('test') || !env.DATABASE_URL) fail();
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { fail(); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.pathname !== '/agromarket_test' || url.search || url.hash) fail();
  if (env.PGDATABASE && env.PGDATABASE !== 'agromarket_test') fail();
}
