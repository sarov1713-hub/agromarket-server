import { expect, test, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { assertTestDatabase } from '../db/testSafety.js';

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
