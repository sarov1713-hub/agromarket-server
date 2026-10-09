import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
const adminOnly = [requireAuth, requireRole('admin')];
const router = Router();
function validateProduct(body) {
  const { name, price, category, unit, image } = body;
  if (typeof name !== 'string' || !name.trim()) return 'Поле name обязательно';
  if (!['number', 'string'].includes(typeof price) || String(price).trim() === '' ||
      !Number.isInteger(Number(price)) || Number(price) < 0 || Number(price) > 2147483647) {
    return 'Поле price должно быть целым числом >= 0 в диапазоне INTEGER';
  }
  if ([category, unit, image].some((value) => value != null && typeof value !== 'string')) {
    return 'Поля category, unit и image должны быть строками';
  }
  return null;
}
function values(body) {
  return [body.name.trim(), Number(body.price), body.category ?? null, body.unit ?? 'кг', body.image ?? null];
}
router.get('/', async (req, res) => {
  const search = req.query.search ?? '';
  if (typeof search !== 'string') return res.status(400).json({ error: 'Параметр search должен быть строкой' });
  const { rows } = await pool.query('SELECT * FROM products WHERE name ILIKE $1 ORDER BY id', [`%${search}%`]);
  res.json(rows);
});
router.get('/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Товар не найден' });
  res.json(rows[0]);
});
router.post('/', adminOnly, async (req, res) => {
  const error = validateProduct(req.body ?? {});
  if (error) return res.status(400).json({ error });
  const { rows } = await pool.query(
    `INSERT INTO products (name, price, category, unit, image)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`, values(req.body),
  );
  res.status(201).json(rows[0]);
});
router.put('/:id', adminOnly, async (req, res) => {
  const error = validateProduct(req.body ?? {});
  if (error) return res.status(400).json({ error });
  const { rows } = await pool.query(
    `UPDATE products SET name = $1, price = $2, category = $3, unit = $4, image = $5
     WHERE id = $6 RETURNING *`, [...values(req.body), req.params.id],
  );
  if (!rows.length) return res.status(404).json({ error: 'Товар не найден' });
  res.json(rows[0]);
});
router.delete('/:id', adminOnly, async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Товар не найден' });
  res.status(204).end();
});
export default router;
