import { afterEach, expect, test, vi } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { pool } from '../db/pool.js';

afterEach(() => vi.restoreAllMocks());

test('GET /api/health: сервер и БД доступны', async () => {
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok', db: 'ok', version: 'local' });
});

test('health возвращает 503 без подробностей при недоступной БД', async () => {
  vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('private database details'));
  const response = await request(app).get('/api/health').expect(503);
  expect(response.body).toEqual({ status: 'error', db: 'unavailable', version: 'local' });
});

test('CORS разрешает localhost', async () => {
  const response = await request(app).get('/api/health').set('Origin', 'http://localhost:5173').expect(200);
  expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
});

test('CORS не разрешает чужой Origin', async () => {
  const response = await request(app).get('/api/health').set('Origin', 'https://evil.example').expect(200);
  expect(response.headers['access-control-allow-origin']).toBeUndefined();
});
