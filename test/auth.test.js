import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';

test('ЛР7: авторизация и защита API', async (t) => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('../', import.meta.url), env: { ...process.env, PORT: '3107' },
    stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
  });
  const base = 'http://localhost:3107/api';
  const email = `auth-${randomUUID()}@test.kz`;
  const ids = [];
  let userToken;
  let adminToken;
  async function request(method, path, status, body, token) {
    const res = await fetch(base + path, { method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(res.status, status, `${method} ${path}`);
    return res.status === 204 ? null : res.json();
  }
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      if (server.exitCode !== null) throw new Error('Тестовый сервер завершился');
      try { if ((await fetch(base + '/health')).ok) { ready = true; break; } } catch {}
      await delay(100);
    }
    assert.ok(ready, 'Сервер готов');
    await t.test('seed: admin и bcrypt cost 10', async () => {
      const { rows: [admin] } = await pool.query('SELECT * FROM users WHERE email = $1', [process.env.ADMIN_EMAIL.trim().toLowerCase()]);
      assert.equal(admin.role, 'admin');
      assert.match(admin.password_hash, /^\$2[aby]\$10\$/);
      assert.ok(await bcrypt.compare(process.env.ADMIN_PASSWORD, admin.password_hash));
    });
    await t.test('register: валидация, нормализация, mass assignment, уникальность', async () => {
      await request('POST', '/auth/register', 400, {});
      await request('POST', '/auth/register', 400, { name: 'Test', email, password: 'short' });
      const result = await request('POST', '/auth/register', 201, { name: '  Test  ', email: ` ${email.toUpperCase()} `, password: 'qwerty123', role: 'admin' });
      ids.push(result.user.id);
      userToken = result.token;
      assert.equal(result.user.name, 'Test');
      assert.equal(result.user.email, email);
      assert.equal(result.user.role, 'user');
      assert.ok(!('password_hash' in result.user));
      assert.deepEqual(Object.keys(jwt.decode(userToken)).sort(), ['exp', 'iat', 'role', 'sub']);
      await request('POST', '/auth/register', 409, { name: 'Test', email, password: 'qwerty123' });
    });
    await t.test('один пароль: разные соли и проверка compare', async () => {
      const result = await request('POST', '/auth/register', 201, { name: 'Test2', email: `second-${email}`, password: 'qwerty123' });
      ids.push(result.user.id);
      const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = ANY($1::int[]) ORDER BY id', [ids]);
      assert.notEqual(rows[0].password_hash, rows[1].password_hash);
      for (const row of rows) assert.ok(await bcrypt.compare('qwerty123', row.password_hash));
    });
    await t.test('login и me: безопасные ответы, успешные входы не расходуют лимит', async () => {
      for (let i = 0; i < 7; i++) {
        const result = await request('POST', '/auth/login', 200, { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
        adminToken = result.token;
        assert.equal(result.user.role, 'admin');
        assert.ok(!('password_hash' in result.user));
      }
      const login = await request('POST', '/auth/login', 200, { email: email.toUpperCase(), password: 'qwerty123' });
      assert.equal(login.user.role, 'user');
      await request('GET', '/auth/me', 401);
      const me = await request('GET', '/auth/me', 200, undefined, userToken);
      assert.equal(me.email, email);
      assert.ok(!('password_hash' in me));
    });
    await t.test('все защищённые маршруты: 401 гостю, 403 user; каталог публичный', async () => {
      for (const [method, path] of [['POST', '/products'], ['PUT', '/products/1'], ['DELETE', '/products/1'], ['GET', '/orders'], ['PATCH', '/orders/1']]) {
        await request(method, path, 401);
        await request(method, path, 403, undefined, userToken);
      }
      await request('GET', '/products', 200);
      await request('GET', '/orders', 200, undefined, adminToken);
    });
    await t.test('подделанный и истёкший JWT', async () => {
      const parts = userToken.split('.');
      parts[1] = Buffer.from(JSON.stringify({ ...jwt.decode(userToken), role: 'admin' })).toString('base64url');
      const forged = await request('POST', '/products', 401, { name: 'forged', price: 1 }, parts.join('.'));
      assert.equal(forged.error, 'Недействительный токен');
      const expired = jwt.sign({ sub: String(ids[0]), role: 'user' }, process.env.JWT_SECRET, { expiresIn: -1 });
      assert.equal((await request('GET', '/auth/me', 401, undefined, expired)).error, 'Срок действия токена истёк, войдите снова');
      for (const header of ['Basic abc', 'Bearer', 'Bearer a b']) {
        const res = await fetch(base + '/auth/me', { headers: { Authorization: header } });
        assert.equal(res.status, 401);
      }
    });
    await t.test('Helmet, JSON 10kb, ошибки JSON и CORS preflight', async () => {
      const health = await fetch(base + '/health');
      assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(health.headers.get('content-security-policy'));
      assert.equal(health.headers.get('x-powered-by'), null);
      await request('POST', '/auth/register', 413, { name: 'a'.repeat(11000) });
      const bad = await fetch(base + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
      assert.equal(bad.status, 400);
      assert.equal((await bad.json()).error, 'Некорректный JSON в теле запроса');
      const preflight = await fetch(base + '/products', { method: 'OPTIONS', headers: {
        Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      } });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173');
      assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);
      assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/);
    });
    await t.test('неверный пароль и неизвестный email: одинаковый 401; затем 429', async () => {
      const wrong = await request('POST', '/auth/login', 401, { email, password: 'wrong-password' });
      const unknown = await request('POST', '/auth/login', 401, { email: `absent-${email}`, password: 'wrong-password' });
      assert.deepEqual(wrong, unknown);
      // Пять неуспешных входов, шестая попытка блокируется.
      for (let i = 0; i < 3; i++) await request('POST', '/auth/login', 401, { email, password: 'wrong-password' });
      const res = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'wrong-password' }) });
      assert.equal(res.status, 429);
      assert.ok(res.headers.get('ratelimit'));
      assert.ok(Number(res.headers.get('retry-after')) > 0);
    });
  } finally {
    if (server.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited; }
    if (ids.length) await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [ids]);
    await pool.end();
  }
});
