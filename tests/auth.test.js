import { expect, test } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { uniqueEmail } from './helpers.js';

const user = () => ({ name: 'Тест', email: uniqueEmail(), password: 'qwerty123' });

test('register: token, роль user, без password_hash', async () => {
  const response = await request(app).post('/api/auth/register').send(user());
  expect(response.status).toBe(201);
  expect(response.body.token).toEqual(expect.any(String));
  expect(response.body.user.role).toBe('user');
  expect(response.body.user).not.toHaveProperty('password_hash');
});

test('register: role=admin игнорируется', async () => {
  const response = await request(app).post('/api/auth/register').send({ ...user(), role: 'admin' }).expect(201);
  expect(response.body.user.role).toBe('user');
});

test('register: дубликат email — 409', async () => {
  const data = user();
  await request(app).post('/api/auth/register').send(data).expect(201);
  await request(app).post('/api/auth/register').send(data).expect(409);
});

test('register: короткий пароль — 400', async () => {
  await request(app).post('/api/auth/register').send({ ...user(), password: '123' }).expect(400);
});

test('register: email приводится к lowercase', async () => {
  const email = `Test${uniqueEmail('case').split('@')[0]}@Mail.KZ`;
  const response = await request(app).post('/api/auth/register').send({ ...user(), email }).expect(201);
  expect(response.body.user.email).toBe(email.toLowerCase());
});

test('register: отсутствуют обязательные поля — 400', async () => {
  await request(app).post('/api/auth/register').send({}).expect(400);
});

test('login: admin получает JWT из трёх частей', async () => {
  const response = await request(app).post('/api/auth/login')
    .send({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
  expect(response.status).toBe(200);
  expect(response.body.user.role).toBe('admin');
  expect(response.body.user).not.toHaveProperty('password_hash');
  expect(response.body.token.split('.')).toHaveLength(3);
  expect(jwt.verify(response.body.token, process.env.JWT_SECRET).role).toBe('admin');
});

test('login: неизвестный email и неверный пароль дают одинаковый 401', async () => {
  const wrong = await request(app).post('/api/auth/login')
    .send({ email: process.env.ADMIN_EMAIL, password: 'wrong-password' }).expect(401);
  const unknown = await request(app).post('/api/auth/login')
    .send({ email: uniqueEmail('absent'), password: 'wrong-password' }).expect(401);
  expect(wrong.body).toEqual(unknown.body);
});

test('me: без токена — 401', async () => {
  await request(app).get('/api/auth/me').expect(401);
});

test('me: правильный пользователь без хэша', async () => {
  const data = user();
  const { body } = await request(app).post('/api/auth/register').send(data).expect(201);
  const me = await request(app).get('/api/auth/me').auth(body.token, { type: 'bearer' }).expect(200);
  expect(me.body).toMatchObject({ id: body.user.id, email: data.email, name: data.name, role: 'user' });
  expect(me.body).not.toHaveProperty('password_hash');
});
