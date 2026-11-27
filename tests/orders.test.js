import { setTimeout as delay } from 'node:timers/promises';
import { beforeAll, expect, test } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import { pool } from '../db/pool.js';
import { getUserToken } from './helpers.js';

const address = 'Астана, улица Тестовая, 13';
let buyer;
let otherBuyer;

beforeAll(async () => {
  buyer = await getUserToken();
  otherBuyer = await getUserToken();
});

async function product(stock, price = 450) {
  const { rows: [{ id }] } = await pool.query(
    "INSERT INTO products (name, price, stock) VALUES ('Яблоки ЛР13', $1, $2) RETURNING id",
    [price, stock],
  );
  return id;
}

async function stock(id) {
  const { rows: [row] } = await pool.query('SELECT stock FROM products WHERE id = $1', [id]);
  return row.stock;
}

function buy(token, items, extra = {}) {
  return request(app).post('/api/orders').auth(token, { type: 'bearer' })
    .send({ address, items, ...extra });
}

function cancel(token, id) {
  return request(app).post(`/api/orders/${id}/cancel`).auth(token, { type: 'bearer' });
}

function myOrders(token) {
  return request(app).get('/api/orders/my').auth(token, { type: 'bearer' });
}

test('заказ → 201, дубликаты объединены, цена и итог из БД, остаток списан', async () => {
  const productId = await product(5);
  const { body } = await buy(buyer, [
    { productId, quantity: 1, price: 1 },
    { productId, quantity: 2 },
  ], { total: 1 }).expect(201);
  expect(body).toMatchObject({
    address, total: '1350', status: 'new',
    items: [{ product_id: productId, price: 450, quantity: 3 }],
  });
  expect(await stock(productId)).toBe(2);
  await pool.query('UPDATE products SET price = 500 WHERE id = $1', [productId]);
  const orders = await myOrders(buyer).expect(200);
  expect(orders.body).toContainEqual(body);
});

test('дефицит → 409, остатки и таблицы заказов сохраняются', async () => {
  const available = await product(3);
  const unavailable = await product(1);
  const counts = `SELECT (SELECT count(*) FROM orders) AS orders,
                         (SELECT count(*) FROM order_items) AS items`;
  const before = (await pool.query(counts)).rows;
  await buy(buyer, [
    { productId: available, quantity: 1 },
    { productId: unavailable, quantity: 1 },
    { productId: unavailable, quantity: 1 },
  ]).expect(409);
  expect(await stock(available)).toBe(3);
  expect(await stock(unavailable)).toBe(1);
  expect((await pool.query(counts)).rows).toEqual(before);
});

test('создание, просмотр и отмена требуют токен', async () => {
  await request(app).post('/api/orders').send({ address, items: [{ productId: 1, quantity: 1 }] }).expect(401);
  await request(app).get('/api/orders/my').expect(401);
  await request(app).post('/api/orders/1/cancel').expect(401);
});

test('заказ отклоняет пустой адрес, пустую корзину и дробное количество', async () => {
  await buy(buyer, [{ productId: 1, quantity: 1 }], { address: ' ' }).expect(400);
  await buy(buyer, []).expect(400);
  await buy(buyer, [{ productId: 1, quantity: 1.5 }]).expect(400);
});

test('покупатель видит только собственные заказы', async () => {
  const productId = await product(2);
  const { body: first } = await buy(buyer, [{ productId, quantity: 1 }]).expect(201);
  const { body: second } = await buy(otherBuyer, [{ productId, quantity: 1 }]).expect(201);
  const { body: orders } = await myOrders(buyer).expect(200);
  expect(orders.map(({ id }) => id)).toContain(first.id);
  expect(orders.map(({ id }) => id)).not.toContain(second.id);
});

test('чужая отмена → 404, своя возвращает остаток один раз, повторная → 409', async () => {
  const productId = await product(5);
  const { body: order } = await buy(buyer, [{ productId, quantity: 3 }]).expect(201);
  await cancel(otherBuyer, order.id).expect(404);
  expect(await stock(productId)).toBe(2);
  const { body } = await cancel(buyer, order.id).expect(200);
  expect(body).toEqual({ id: order.id, status: 'cancelled' });
  await cancel(buyer, order.id).expect(409);
  expect(await stock(productId)).toBe(5);
  const { body: orders } = await myOrders(buyer).expect(200);
  expect(orders.find(({ id }) => id === order.id).status).toBe('cancelled');
});

test('race: два покупателя претендуют на последнюю единицу', async () => {
  const productId = await product(1);
  const blocker = await pool.connect();
  let attempts;
  try {
    await blocker.query('BEGIN');
    // Gate both requests at the lock (or at UPDATE if the checkout lock is removed).
    await blocker.query('SELECT id FROM products WHERE id = $1 FOR NO KEY UPDATE', [productId]);
    attempts = Promise.all([
      buy(buyer, [{ productId, quantity: 1 }]),
      buy(otherBuyer, [{ productId, quantity: 1 }]),
    ]);
    const deadline = Date.now() + 5_000;
    let waiting = 0;
    do {
      const { rows: [activity] } = await pool.query(
        `SELECT count(*)::int AS waiting FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock'
           AND (query LIKE 'SELECT id, name, price, stock FROM products%'
                OR query LIKE 'UPDATE products SET stock = stock - %')`,
      );
      waiting = activity.waiting;
      if (waiting < 2) await delay(20);
    } while (waiting < 2 && Date.now() < deadline);
    expect(waiting).toBe(2);
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    if (attempts) await attempts;
  }
  const replies = await attempts;
  const remaining = await stock(productId);
  const { rows: [persisted] } = await pool.query(
    'SELECT count(*)::int AS orders FROM order_items WHERE product_id = $1', [productId],
  );
  console.log('Race:', replies.map((response) => response.status).sort(), { remaining, orders: persisted.orders });
  expect(replies.map((response) => response.status).sort()).toEqual([201, 409]);
  expect(remaining).toBe(0);
  expect(persisted.orders).toBe(1);
});
