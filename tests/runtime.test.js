import { expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function run(args, env = {}) {
  return spawnSync(process.execPath, args, {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, ...env }, encoding: 'utf8', timeout: 10000, windowsHide: true,
  });
}

test('server: отсутствие CORS_ORIGIN останавливает запуск', () => {
  const result = run(['server.js'], { CORS_ORIGIN: '' });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('CORS_ORIGIN');
  expect(result.stdout).not.toContain('API:');
});

test('server: сообщает все отсутствующие env до создания Pool', () => {
  const result = run(['server.js'], { DATABASE_URL: '', JWT_SECRET: '', CORS_ORIGIN: '' });
  expect(result.status).toBe(1);
  for (const key of ['DATABASE_URL', 'JWT_SECRET', 'CORS_ORIGIN']) expect(result.stderr).toContain(key);
});

test('server: production отклоняет короткий JWT_SECRET', () => {
  const result = run(['server.js'], { NODE_ENV: 'production', JWT_SECRET: '123' });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('минимум 32');
});

test('server: обработчик SIGTERM закрывает Pool и завершает процесс с 0', () => {
  // Windows не передаёт POSIX SIGTERM дочернему Node: вызываем зарегистрированное событие.
  const result = run(['--input-type=module', '-e', `
    const { pool } = await import('./db/pool.js');
    const end = pool.end.bind(pool);
    pool.end = async () => { await end(); console.log('POOL_CLOSED'); };
    const log = console.log;
    console.log = (...args) => {
      log(...args);
      if (String(args[0]).includes('АгроМаркет API:')) setImmediate(() => process.emit('SIGTERM'));
    };
    await import('./server.js');
  `], { PORT: '0' });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('SIGTERM');
  expect(result.stdout).toContain('POOL_CLOSED');
});

test('несколько CORS origins, preflight, версия коммита и Helmet', () => {
  const result = run(['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { once } from 'node:events';
    import app from './app.js';
    import { pool } from './db/pool.js';
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    try {
      for (const origin of ['http://localhost:5173', 'https://frontend.example']) {
        const response = await fetch(base + '/api/health', { headers: { Origin: origin } });
        assert.equal(response.headers.get('access-control-allow-origin'), origin);
        assert.equal(response.headers.get('x-powered-by'), null);
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        assert.ok(response.headers.get('strict-transport-security'));
        assert.equal((await response.json()).version, '1234567');
      }
      const preflight = await fetch(base + '/api/products', { method: 'OPTIONS', headers: {
        Origin: 'https://frontend.example', 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      } });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://frontend.example');
    } finally { server.close(); server.closeAllConnections(); await pool.end(); }
  `], { CORS_ORIGIN: ' http://localhost:5173, https://frontend.example ', RENDER_GIT_COMMIT: '123456789abcdef' });
  expect(result.status, result.stderr).toBe(0);
});
