import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { idParam, validate } from '../middleware/validate.js';
import { orderSchema } from '../validation/schemas.js';
const adminOnly = [requireAuth, requireRole('admin')];
const router = Router();

async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query(result.status < 400 ? 'COMMIT' : 'ROLLBACK');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const orderFields = 'o.id, o.address, o.total, o.status, o.created_at';

router.post('/', requireAuth, validate(orderSchema), async (req, res) => {
  const quantities = new Map();
  for (const { productId, quantity } of req.body.items) {
    quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
  }
  const result = await transaction(async (client) => {
    const { rows: products } = await client.query(
      'SELECT id, name, price, stock FROM products WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
      [[...quantities.keys()]],
    );
    if (products.length !== quantities.size || products.some(({ id, stock }) => stock < quantities.get(id))) {
      return { status: 409, body: { error: 'Некоторых товаров нет в нужном количестве' } };
    }
    const total = products.reduce(
      (sum, { id, price }) => sum + BigInt(price) * BigInt(quantities.get(id)), 0n,
    ).toString();
    const { rows: [order] } = await client.query(
      `INSERT INTO orders AS o (user_id, name, email, address, total)
       SELECT id, name, email, $2, $3 FROM users WHERE id = $1
       RETURNING ${orderFields}`,
      [req.user.id, req.body.address, total],
    );
    if (!order) return { status: 401, body: { error: 'Войдите заново' } };
    const items = [];
    for (const { id, name, price } of products) {
      const quantity = quantities.get(id);
      const { rows: [item] } = await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, price)
         VALUES ($1, $2, $3, $4, $5) RETURNING product_id, product_name, quantity, price`,
        [order.id, id, name, quantity, price],
      );
      await client.query('UPDATE products SET stock = stock - $2 WHERE id = $1', [id, quantity]);
      items.push(item);
    }
    return { status: 201, body: { ...order, items } };
  });
  res.status(result.status).json(result.body);
});

router.get('/my', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${orderFields}, (
       SELECT json_agg(json_build_object(
         'product_id', i.product_id, 'product_name', i.product_name, 'quantity', i.quantity, 'price', i.price
       ) ORDER BY i.product_id)
       FROM order_items i WHERE i.order_id = o.id
     ) AS items
     FROM orders o WHERE o.user_id = $1 AND o.address IS NOT NULL
     ORDER BY o.created_at DESC, o.id DESC`,
    [req.user.id],
  );
  res.json(rows);
});

router.post('/:id/cancel', requireAuth, idParam, async (req, res) => {
  const result = await transaction(async (client) => {
    const { rows: [order] } = await client.query(
      'SELECT id, status FROM orders WHERE id = $1 AND user_id = $2 AND address IS NOT NULL FOR UPDATE',
      [req.params.id, req.user.id],
    );
    if (!order) return { status: 404, body: { error: 'Заказ не найден' } };
    if (order.status !== 'new') {
      return { status: 409, body: { error: 'Отменить можно только новый заказ' } };
    }
    const { rows: items } = await client.query(
      'SELECT product_id, quantity FROM order_items WHERE order_id = $1 ORDER BY product_id', [order.id],
    );
    for (const { product_id, quantity } of items) {
      await client.query('UPDATE products SET stock = stock + $2 WHERE id = $1', [product_id, quantity]);
    }
    await client.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [order.id]);
    return { status: 200, body: { id: order.id, status: 'cancelled' } };
  });
  res.status(result.status).json(result.body);
});

router.get('/', adminOnly, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.*, p.name AS product_name FROM orders o
     LEFT JOIN products p ON p.id = o.product_id ORDER BY o.created_at DESC, o.id DESC`,
  );
  res.json(rows);
});
router.post('/wholesale', async (req, res) => {
  const { product_id, name, email, phone, quantity, date, comment } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !email.trim() ||
      quantity == null || quantity === '') {
    return res.status(400).json({ error: 'Поля name, email и quantity обязательны' });
  }
  if (!['number', 'string'].includes(typeof quantity) || !Number.isInteger(Number(quantity)) ||
      Number(quantity) < 10 || Number(quantity) > 2147483647) {
    return res.status(400).json({ error: 'Минимальный объём заказа — 10 кг; quantity должно быть целым числом в диапазоне INTEGER' });
  }
  if ([phone, date, comment].some((value) => value != null && typeof value !== 'string')) {
    return res.status(400).json({ error: 'Поля phone, date и comment должны быть строками' });
  }
  const { rows } = await pool.query(
    `INSERT INTO orders (product_id, name, email, phone, quantity, delivery_date, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [product_id || null, name.trim(), email.trim(), phone || null, Number(quantity), date || null, comment || null],
  );
  res.status(201).json(rows[0]);
});
router.patch('/:id', adminOnly, idParam, async (req, res) => {
  const { status } = req.body ?? {};
  if (typeof status !== 'string' || !status.trim()) {
    return res.status(400).json({ error: 'Поле status обязательно' });
  }
  const { rows } = await pool.query(
    `UPDATE orders SET status = $1 WHERE id = $2 AND
       (address IS NULL OR (status IN ('new', 'processing') AND $1 IN ('processing', 'done')))
     RETURNING *`,
    [status, req.params.id],
  );
  if (!rows.length) {
    const { rowCount } = await pool.query('SELECT 1 FROM orders WHERE id = $1', [req.params.id]);
    if (rowCount) return res.status(409).json({ error: 'Недопустимое изменение статуса заказа' });
    return res.status(404).json({ error: 'Заявка не найдена' });
  }
  res.json(rows[0]);
});
export default router;
