import { expect, test } from 'vitest';
import request from 'supertest';
import app from '../app.js';

test('GET /api/health: сервер и БД доступны', async () => {
  const response = await request(app).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ status: 'ok', db: 'connected' });
});
