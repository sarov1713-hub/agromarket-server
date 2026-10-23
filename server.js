import 'dotenv/config';
const missing = ['DATABASE_URL', 'JWT_SECRET', 'CORS_ORIGIN']
  .filter((key) => !process.env[key]?.trim());
if (missing.length) {
  console.error(`Не заданы обязательные переменные: ${missing.join(', ')}`);
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET слишком короткий: для production требуется минимум 32 символа');
  process.exit(1);
}

// Pool создаётся только после проверки всех обязательных настроек.
const { default: app } = await import('./app.js');
const { pool } = await import('./db/pool.js');
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`АгроМаркет API: http://localhost:${PORT}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal}: завершаем HTTP-запросы и закрываем PostgreSQL`);
  const timeout = setTimeout(() => {
    console.error('Превышено время завершения сервера');
    process.exit(1);
  }, 10000);
  timeout.unref();
  server.close(async (error) => {
    try {
      await pool.end();
      clearTimeout(timeout);
      process.exit(error ? 1 : 0);
    } catch {
      console.error('Не удалось корректно закрыть PostgreSQL');
      process.exit(1);
    }
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
