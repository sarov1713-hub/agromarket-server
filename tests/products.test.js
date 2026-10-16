import { expect, test } from 'vitest';
import request from 'supertest';
import app from '../app.js';

test('публичный каталог — непустой массив', async () => {
  const response = await request(app).get('/api/products');
  expect(response.status).toBe(200);
  expect(Array.isArray(response.body)).toBe(true);
  expect(response.body.length).toBeGreaterThan(0);
});

test('товар содержит id, name, price', async () => {
  const { body } = await request(app).get('/api/products').expect(200);
  expect(body[0]).toMatchObject({ id: expect.any(Number), name: expect.any(String), price: expect.any(Number) });
});

test('несуществующий товар — 404', async () => {
  await request(app).get('/api/products/999999').expect(404);
});

test('детали товара совпадают с каталогом', async () => {
  const { body: [first] } = await request(app).get('/api/products').expect(200);
  const response = await request(app).get(`/api/products/${first.id}`);
  expect(response.status).toBe(200);
  expect(response.body.name).toBe(first.name);
});

test('поиск ILIKE без учёта регистра', async () => {
  const { body } = await request(app).get('/api/products').query({ search: 'МОЛ' }).expect(200);
  expect(body.length).toBeGreaterThan(0);
  expect(body.every((p) => p.name.toLowerCase().includes('мол'))).toBe(true);
});

test('неверный id возвращает JSON 400', async () => {
  const { body } = await request(app).get('/api/products/abc').expect(400).expect('Content-Type', /json/);
  expect(body.error).toBe('Неверный формат значения');
});
