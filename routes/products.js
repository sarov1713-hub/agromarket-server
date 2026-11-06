import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate, idParam } from '../middleware/validate.js';
import { productSchema, productUpdateSchema } from '../validation/schemas.js';
const adminOnly = [requireAuth, requireRole('admin')];
const router = Router();
function values(body) {
  return [body.name.trim(), Number(body.price), body.category ?? null, body.unit ?? 'кг', body.image ?? null];
}
router.get('/', async (req, res) => {
  const search = req.query.search ?? '';
  if (typeof search !== 'string') return res.status(400).json({ error: 'Параметр search должен быть строкой' });
  const { rows } = await pool.query('SELECT * FROM products WHERE name ILIKE $1 ORDER BY id', [`%${search}%`]);
  res.json(rows);
});
router.get('/:id', idParam, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Товар не найден' });
  res.json(rows[0]);
});
router.post('/', adminOnly, validate(productSchema), async (req, res) => {
  const { rows } = await pool.query(
    `INSERT INTO products (name, price, category, unit, image)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`, values(req.body),
  );
  res.status(201).json(rows[0]);
});
router.put('/:id', adminOnly, idParam, validate(productSchema), async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE products SET name = $1, price = $2, category = $3, unit = $4, image = $5
     WHERE id = $6 RETURNING *`, [...values(req.body), req.params.id],
  );
  if (!rows.length) return res.status(404).json({ error: 'Товар не найден' });
  res.json(rows[0]);
});
router.patch('/:id', adminOnly, idParam, validate(productUpdateSchema), async (req, res) => {
  // Имена колонок берутся только из константного whitelist, значения — параметры SQL.
  const fields = ['name', 'price', 'category', 'unit', 'image'].filter((key) => Object.hasOwn(req.body, key));
  const assignments = fields.map((key, index) => `${key} = $${index + 1}`).join(', ');
  const { rows } = await pool.query(
    `UPDATE products SET ${assignments} WHERE id = $${fields.length + 1} RETURNING *`,
    [...fields.map((key) => req.body[key]), req.params.id],
  );
  if (!rows.length) return res.status(404).json({ error: 'Товар не найден' });
  res.json(rows[0]);
});
router.delete('/:id', adminOnly, idParam, async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Товар не найден' });
  res.status(204).end();
});
export default router;
