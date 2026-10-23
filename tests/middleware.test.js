import { afterEach, expect, test, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { assertTestDatabase } from '../db/testSafety.js';
import { assertSeedAllowed } from '../db/seedSafety.js';
import { errorHandler } from '../middleware/errorHandler.js';

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function mockRes() {
  const res = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

test('requireRole: admin проходит', () => {
  const res = mockRes();
  const next = vi.fn();
  requireRole('admin')({ user: { role: 'admin' } }, res, next);
  expect(next).toHaveBeenCalledTimes(1);
  expect(res.status).not.toHaveBeenCalled();
});

test('requireRole: user получает 403', () => {
  const res = mockRes();
  const next = vi.fn();
  requireRole('admin')({ user: { role: 'user' } }, res, next);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(next).not.toHaveBeenCalled();
});

test('requireAuth: нет заголовка — 401', () => {
  const res = mockRes();
  const next = vi.fn();
  requireAuth({ get: vi.fn(() => undefined) }, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});

test('requireAuth: валидный JWT заполняет req.user', () => {
  const token = jwt.sign({ sub: '7', role: 'user' }, process.env.JWT_SECRET, { expiresIn: '2h' });
  const req = { get: vi.fn(() => `Bearer ${token}`) };
  const res = mockRes();
  const next = vi.fn();
  requireAuth(req, res, next);
  expect(next).toHaveBeenCalledTimes(1);
  expect(req.user).toEqual({ id: 7, role: 'user' });
  expect(res.status).not.toHaveBeenCalled();
});

test('requireAuth: истёкший JWT — 401', () => {
  const token = jwt.sign({ sub: '7', role: 'user', exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);
  const res = mockRes();
  const next = vi.fn();
  requireAuth({ get: vi.fn(() => `Bearer ${token}`) }, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(res.json).toHaveBeenCalledWith({ error: expect.stringMatching(/истёк/) });
  expect(next).not.toHaveBeenCalled();
});

test('requireAuth: некорректный sub — 401', () => {
  const token = jwt.sign({ sub: 'invalid', role: 'user' }, process.env.JWT_SECRET);
  const res = mockRes();
  const next = vi.fn();
  requireAuth({ get: vi.fn(() => `Bearer ${token}`) }, res, next);
  expect(res.status).toHaveBeenCalledWith(401);
  expect(next).not.toHaveBeenCalled();
});

test('защита БД отклоняет production, в том числе test в пароле/hostname', () => {
  for (const DATABASE_URL of [
    'postgres://postgres:password@localhost/agromarket',
    'postgres://postgres:test-password@test-host/agromarket',
    'postgres://postgres:password@localhost/agromarket_test?database=agromarket',
  ]) expect(() => assertTestDatabase({ DATABASE_URL })).toThrow(/тестовой базой/);
  expect(() => assertTestDatabase({ PGDATABASE: 'agromarket_test' })).toThrow();
  expect(() => assertTestDatabase({ DATABASE_URL: 'postgres://postgres:password@localhost/agromarket_test' })).not.toThrow();
});

test('production скрывает сообщение 5xx, полная ошибка остаётся в серверном логе', () => {
  vi.stubEnv('NODE_ENV', 'production');
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = new Error('connect ECONNREFUSED 10.0.0.5:5432');
  const res = mockRes();
  errorHandler(error, {}, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json).toHaveBeenCalledWith({ error: 'Внутренняя ошибка сервера' });
  expect(log).toHaveBeenCalledWith(error);
});

test('production сохраняет понятное сообщение 4xx', () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = Object.assign(new Error('Проверьте параметры заявки'), { status: 400 });
  const res = mockRes();
  errorHandler(error, {}, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith({ error: error.message });
});

test('development сохраняет сообщение ошибки и statusCode', () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = Object.assign(new Error('Development detail'), { statusCode: 503 });
  const res = mockRes();
  errorHandler(error, {}, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith({ error: error.message });
});

test('seed: loopback разрешён, удалённая БД требует --force', () => {
  expect(() => assertSeedAllowed({ DATABASE_URL: 'postgres://u:p@localhost/agromarket' }, [])).not.toThrow();
  expect(() => assertSeedAllowed({ DATABASE_URL: 'postgres://u:p@127.0.0.1/agromarket' }, [])).not.toThrow();
  for (const host of ['remote.example', 'localhost.evil.example', '192.168.157.128']) {
    const env = { DATABASE_URL: `postgres://u:localhost@${host}/agromarket` };
    expect(() => assertSeedAllowed(env, [])).toThrow(/НЕ на локальной/);
    expect(() => assertSeedAllowed(env, ['--force'])).not.toThrow();
  }
});

test('seed: --force не отключает защиту рабочей базы от тестов', () => {
  expect(() => assertSeedAllowed({ NODE_ENV: 'test', DATABASE_URL: 'postgres://u:p@localhost/agromarket' }, ['--force'])).toThrow(/тестовой базой/);
  expect(() => assertSeedAllowed({ NODE_ENV: 'test', DATABASE_URL: 'postgres://u:p@remote.example/agromarket_test' }, ['--force'])).not.toThrow();
});
