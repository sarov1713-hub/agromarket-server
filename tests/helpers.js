import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../app.js';

export function uniqueEmail(prefix = 'user') {
  return `${prefix}-${Date.now()}-${randomUUID()}@test.kz`;
}

export async function getUserToken() {
  const response = await request(app).post('/api/auth/register')
    .send({ name: 'Тестовый пользователь', email: uniqueEmail(), password: 'qwerty123' }).expect(201);
  return response.body.token;
}

export async function getAdminToken() {
  const response = await request(app).post('/api/auth/login')
    .send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }).expect(200);
  return response.body.token;
}
