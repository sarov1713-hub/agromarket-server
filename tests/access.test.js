import { beforeAll, expect, test } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app.js';
import { getAdminToken, getUserToken, uniqueEmail } from './helpers.js';

let userToken;
let adminToken;
const newProduct = { name: 'Тестовый мёд', category: 'Мёд', price: 2500, unit: 'кг' };
beforeAll(async () => {
  userToken = await getUserToken();
  adminToken = await getAdminToken();
});

test('POST products без токена — 401', async () => {
  await request(app).post('/api/products').send(newProduct).expect(401);
});

test('POST products от user — 403', async () => {
  await request(app).post('/api/products').auth(userToken, { type: 'bearer' }).send(newProduct).expect(403);
});

test('POST products с JWT, подписанным чужим ключом — 401', async () => {
  const fake = jwt.sign({ sub: '1', role: 'admin' }, 'foreign-signing-key', { expiresIn: '2h' });
  await request(app).post('/api/products').auth(fake, { type: 'bearer' }).send(newProduct).expect(401);
});

test('admin: полный CRUD товара', async () => {
  const created = await request(app).post('/api/products').auth(adminToken, { type: 'bearer' }).send(newProduct).expect(201);
  const id = created.body.id;
  try {
    const updated = await request(app).put(`/api/products/${id}`).auth(adminToken, { type: 'bearer' })
      .send({ ...newProduct, price: 3000 }).expect(200);
    expect(updated.body.price).toBe(3000);
    await request(app).delete(`/api/products/${id}`).auth(adminToken, { type: 'bearer' }).expect(204);
    await request(app).get(`/api/products/${id}`).expect(404);
  } finally {
    await request(app).delete(`/api/products/${id}`).auth(adminToken, { type: 'bearer' });
  }
});

test('DELETE products от user — 403', async () => {
  await request(app).delete('/api/products/1').auth(userToken, { type: 'bearer' }).expect(403);
});

test('GET orders без токена — 401', async () => {
  await request(app).get('/api/orders').expect(401);
});

test('GET orders от user — 403', async () => {
  await request(app).get('/api/orders').auth(userToken, { type: 'bearer' }).expect(403);
});

test('GET orders от admin — массив', async () => {
  const response = await request(app).get('/api/orders').auth(adminToken, { type: 'bearer' }).expect(200);
  expect(Array.isArray(response.body)).toBe(true);
});

test('публичная заявка, смена статуса и ON DELETE SET NULL', async () => {
  const { body: product } = await request(app).post('/api/products').auth(adminToken, { type: 'bearer' }).send(newProduct).expect(201);
  try {
    const { body: order } = await request(app).post('/api/orders').send({
      name: 'Тестовая заявка', email: uniqueEmail(), quantity: 20, product_id: product.id, date: '2026-12-15',
    }).expect(201);
    expect(order.delivery_date).toBe('2026-12-15');
    await request(app).patch(`/api/orders/${order.id}`).send({ status: 'done' }).expect(401);
    await request(app).patch(`/api/orders/${order.id}`).auth(userToken, { type: 'bearer' }).send({ status: 'done' }).expect(403);
    const patched = await request(app).patch(`/api/orders/${order.id}`).auth(adminToken, { type: 'bearer' }).send({ status: 'processing' }).expect(200);
    expect(patched.body.status).toBe('processing');
    await request(app).patch(`/api/orders/${order.id}`).auth(adminToken, { type: 'bearer' }).send({ status: 'lost' }).expect(400);
    await request(app).delete(`/api/products/${product.id}`).auth(adminToken, { type: 'bearer' }).expect(204);
    const { body: orders } = await request(app).get('/api/orders').auth(adminToken, { type: 'bearer' }).expect(200);
    expect(orders.find((o) => o.id === order.id)).toMatchObject({ product_id: null, product_name: null });
  } finally {
    await request(app).delete(`/api/products/${product.id}`).auth(adminToken, { type: 'bearer' });
  }
});

test('admin: неверная цена — 400', async () => {
  await request(app).post('/api/products').auth(adminToken, { type: 'bearer' }).send({ ...newProduct, price: -5 }).expect(400);
});

test('заявка меньше 10 кг — 400', async () => {
  const response = await request(app).post('/api/orders').send({ name: 'Тест', email: uniqueEmail(), quantity: 5 }).expect(400);
  expect(response.body.error).toMatch(/10 кг/);
});
