import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { pool } from '../db/pool.js';

// Реальная БД из .env. Удаляются только записи, созданные этим тестом.
test('CRUD, ошибки PostgreSQL, перезапуск Express и ON DELETE SET NULL', async (t) => {
  let server;
  let productId;
  let orderId;
  let base;
  let adminToken;
  async function start() {
    server = spawn(process.execPath, ['server.js'], {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, PORT: '3106' },
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    base = 'http://localhost:3106/api';
    for (let n = 0; n < 50; n++) {
      if (server.exitCode !== null) throw new Error('Тестовый сервер не запустился');
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await delay(100);
    }
    throw new Error('Сервер не готов');
  }
  async function stop() {
    if (server && server.exitCode === null) {
      const exited = once(server, 'exit');
      server.kill();
      await exited;
    }
  }
  async function request(method, path, status, body) {
    const response = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173',
        ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, status, `${method} ${path}`);
    if (status === 204) { assert.equal(await response.text(), ''); return; }
    assert.match(response.headers.get('content-type'), /application\/json/);
    return response.json();
  }
  try {
    await start();
    adminToken = (await request('POST', '/auth/login', 200, {
      email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD,
    })).token;
    assert.equal((await request('GET', '/health', 200)).db, 'connected');
    assert.equal((await request('GET', '/about', 200)).name, 'АгроМаркет');
    const products = await request('GET', '/products', 200);
    assert.ok(products.some((p) => p.name === 'Молоко фермерское, 1 л' && p.price === 600 && p.image));
    const found = await request('GET', '/products?search=' + encodeURIComponent('МОЛ'), 200);
    assert.ok(found.length > 0 && found.every((p) => p.name.toLowerCase().includes('мол')));
    assert.deepEqual(await request('GET', '/products?search=' + encodeURIComponent("' OR 1=1 --"), 200), []);
    await request('GET', '/products/abc', 400);
    await request('GET', '/products/2147483647', 404);
    await request('GET', '/missing', 404);
    for (const price of [-5, null, true, '', 1.5, {}, 2147483648]) {
      await request('POST', '/products', 400, { name: 'Тест', price });
    }
    await request('POST', '/products', 400, { price: 100 });
    const product = await request('POST', '/products', 201, { name: 'API integration test', price: 100, category: 'test', image: 'test.png' });
    productId = product.id;
    assert.equal(typeof productId, 'number');
    assert.equal((await request('GET', `/products/${productId}`, 200)).price, 100);
    const updated = await request('PUT', `/products/${productId}`, 200, { name: 'API integration updated', price: 150 });
    assert.equal(updated.price, 150);
    assert.equal(updated.category, null);
    assert.equal(updated.image, null);
    const body = { name: 'API integration test', email: 'test@example.com', quantity: '20', phone: '+70000000000', date: '2026-12-15', comment: 'test' };
    assert.match((await request('POST', '/orders', 400, { ...body, quantity: 5 })).error, /10 кг/);
    await request('POST', '/orders', 400, { ...body, quantity: 10.5 });
    await request('POST', '/orders', 400, { ...body, product_id: 2147483647 });
    await request('POST', '/orders', 400, { ...body, date: '2026-02-30' });
    const order = await request('POST', '/orders', 201, { ...body, product_id: productId });
    orderId = order.id;
    assert.equal(order.delivery_date, body.date);
    assert.equal((await request('GET', '/orders', 200)).find((o) => o.id === orderId).product_name, updated.name);
    assert.equal((await request('PATCH', `/orders/${orderId}`, 200, { status: 'processing' })).status, 'processing');
    await request('PATCH', `/orders/${orderId}`, 400, { status: 'lost' });
    await request('PATCH', `/orders/${orderId}`, 400, {});
    await request('PATCH', '/orders/2147483647', 404, { status: 'done' });
    await stop();
    await start();
    assert.equal((await request('GET', `/products/${productId}`, 200)).price, 150);
    assert.equal((await request('GET', '/orders', 200)).find((o) => o.id === orderId).status, 'processing');
    await request('DELETE', `/products/${productId}`, 204);
    await request('DELETE', `/products/${productId}`, 404);
    await request('GET', `/products/${productId}`, 404);
    const orphan = (await request('GET', '/orders', 200)).find((o) => o.id === orderId);
    assert.equal(orphan.product_id, null);
    assert.equal(orphan.product_name, null);
    // Проверяем ограничения напрямую, обходя JS-валидацию API.
    for (const [sql, params, code] of [
      ['INSERT INTO products (name, price) VALUES ($1, $2)', ['test', -5], '23514'],
      ['INSERT INTO products (price) VALUES ($1)', [100], '23502'],
      ['INSERT INTO orders (name, email, quantity) VALUES ($1, $2, $3)', ['test', 'test@example.com', 5], '23514'],
    ]) {
      await assert.rejects(pool.query(sql, params), (error) => error.code === code);
    }
    const malformed = await fetch(base + '/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);
    assert.ok((await malformed.json()).error);
    t.diagnostic('Проверены реальные SQL-запросы, ошибки, дата, перезапуск и сохранение связанной заявки');
  } finally {
    await stop();
    if (orderId) await pool.query('DELETE FROM orders WHERE id = $1', [orderId]);
    if (productId) await pool.query('DELETE FROM products WHERE id = $1', [productId]);
    await pool.end();
  }
});
