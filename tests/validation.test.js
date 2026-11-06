import { beforeAll, expect, test } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { pool } from '../db/pool.js';
import { getAdminToken, uniqueEmail } from './helpers.js';

let token;
beforeAll(async () => { token = await getAdminToken(); });
const user = () => ({ name: 'Покупатель', email: uniqueEmail(), password: 'Password123' });
const product = { name: 'Тестовый товар', category: 'Овощи', price: 500, unit: 'кг' };
test('неправильный email возвращает details.email', async () => {
  const { body } = await request(app).post('/api/auth/register').send({ ...user(), email: 'invalid' }).expect(400);
  expect(body.details).toContainEqual(expect.objectContaining({ field: 'email', message: 'Некорректный e-mail' }));
});
test('mass assignment: роль user хранится в БД и JWT', async () => {
  const { body } = await request(app).post('/api/auth/register').send({ ...user(), role: 'admin', id: 1 }).expect(201);
  const { rows } = await pool.query('SELECT role FROM users WHERE id=$1', [body.user.id]);
  expect(rows[0].role).toBe('user');
  await request(app).post('/api/products').auth(body.token, { type: 'bearer' }).send(product).expect(403);
});
test('пароль из 7 символов отклонён', async () => {
  await request(app).post('/api/auth/register').send({ ...user(), password: '1234567' }).expect(400);
});
test.each([-500, 0, '', ' ', null, false, [], {}, 10000001, 1.5])('неверная цена %j отклонена', async (price) => {
  const { body } = await request(app).post('/api/products').auth(token, { type: 'bearer' }).send({ ...product, price }).expect(400);
  expect(body.details).toContainEqual(expect.objectContaining({ field: 'price' }));
});
test.each(['abc', '0', '-1', '1.5', '1e2', '2147483648'])('неверный ID %s возвращает 400', async (id) => {
  await request(app).get(`/api/products/${id}`).expect(400);
});
test('пустой PATCH и только лишнее поле не принимаются', async () => {
  for (const body of [{}, { admin: true }]) {
    await request(app).patch('/api/products/1').auth(token, { type: 'bearer' }).send(body).expect(400);
  }
});
test('JSON более 100 KB возвращает 413', async () => {
  await request(app).post('/api/auth/register').send({ name: 'x'.repeat(101 * 1024) }).expect(413);
});
test('PATCH меняет только разрешённые указанные поля', async () => {
  const { body: created } = await request(app).post('/api/products').auth(token, { type: 'bearer' }).send(product).expect(201);
  try {
    const { body } = await request(app).patch(`/api/products/${created.id}`).auth(token, { type: 'bearer' })
      .send({ price: '700', id: 999, role: 'admin' }).expect(200);
    expect(body).toMatchObject({ id: created.id, name: product.name, unit: 'кг', price: 700 });
    expect(body).not.toHaveProperty('role');
  } finally {
    await request(app).delete(`/api/products/${created.id}`).auth(token, { type: 'bearer' }).expect(204);
  }
});
test.each([{ name: '' }, { category: '' }, { category: 'x'.repeat(51) }, { unit: '' }, { image: 'javascript:alert(1)' }])('ограничения полей товара %j', async (fields) => {
  await request(app).post('/api/products').auth(token, { type: 'bearer' }).send({ ...product, ...fields }).expect(400);
});
test('длинный UTF-8 пароль и отсутствие email отклонены', async () => {
  await request(app).post('/api/auth/register').send({ ...user(), password: 'я'.repeat(37) }).expect(400);
  await request(app).post('/api/auth/login').send({ password: 'test' }).expect(400);
});
