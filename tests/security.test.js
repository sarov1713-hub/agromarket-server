import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import app from '../app.js';
import { authLimiter } from '../middleware/rateLimit.js';

vi.mock('../db/pool.js', () => ({ pool: { query: vi.fn(), end: vi.fn() } }));
beforeEach(() => { pool.query.mockReset(); pool.query.mockResolvedValue({ rows: [], rowCount: 0 }); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const admin = () => jwt.sign({ sub: '1', role: 'admin' }, process.env.JWT_SECRET);

test('Helmet, CORS разрешённый/чужой Origin и отсутствие Origin', async () => {
  for (const origin of ['', 'http://localhost:5173', 'https://evil.example']) {
    const req = request(app).get('/api/health');
    if (origin) req.set('Origin', origin);
    const { headers } = await req.expect(200);
    expect(headers['x-powered-by']).toBeUndefined();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['access-control-allow-origin']).toBe(origin === 'http://localhost:5173' ? origin : undefined);
  }
});
test('20 попыток: 10 × 401, затем 10 × 429; подмена XFF не обходит лимит', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  authLimiter.resetKey('::/56');
  authLimiter.resetKey('127.0.0.1');
  const statuses = [];
  // Express при прямом подключении игнорирует заголовок клиента.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let response;
  for (let i = 0; i < 20; i++) {
    response = await request(app).post('/api/auth/login').set('X-Forwarded-For', `203.0.113.${i + 1}`)
      .send({ email: 'absent@example.test', password: 'wrong' });
    statuses.push(response.status);
  }
  expect(statuses).toEqual([...Array(10).fill(401), ...Array(10).fill(429)]);
  expect(response.headers.ratelimit).toMatch(/limit=10/);
  expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  expect(response.body.error).toBe('Слишком много попыток. Попробуйте через 15 минут');
  await request(app).post('/api/auth/register').send({ name: 'User', email: 'x@example.test', password: 'Password123' }).expect(429);
});
test('в test limiter отключён даже после исчерпания счётчика', async () => {
  for (let i = 0; i < 20; i++) {
    await request(app).post('/api/auth/login').send({ email: 'x@example.test', password: 'wrong' }).expect(401);
  }
});
test('валидация происходит до SQL: email, пароль, цена, id, пустой PATCH', async () => {
  for (const body of [{ name: 'User', email: 'bad', password: 'Password123' }, { name: 'User', email: 'x@example.test', password: '1234567' }]) {
    const response = await request(app).post('/api/auth/register').send(body).expect(400);
    expect(response.body.details.length).toBeGreaterThan(0);
  }
  await request(app).post('/api/products').auth(admin(), { type: 'bearer' }).send({ name: 'Item', category: 'Food', price: -500 }).expect(400);
  await request(app).get('/api/products/abc').expect(400);
  await request(app).patch('/api/products/1').auth(admin(), { type: 'bearer' }).send({}).expect(400);
  expect(pool.query).not.toHaveBeenCalled();
});
test('лимит тела 100 KB: 20 KB допускается, 101 KB даёт 413', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await request(app).post('/api/auth/register').send({ name: 'x'.repeat(20 * 1024) }).expect(400);
  await request(app).post('/api/auth/register').send({ name: 'x'.repeat(101 * 1024) }).expect(413);
});
