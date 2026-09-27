import { Router } from 'express';
import { products } from '../data/products.js';

const router = Router();

router.get('/', (req, res) => {
  const search = (req.query.search || '').toLowerCase();

  const result = products.filter((p) =>
    p.name.toLowerCase().includes(search)
  );

  res.json(result);
});

router.get('/:id', (req, res) => {
  const product = products.find(
    (p) => String(p.id) === req.params.id
  );

  if (!product) {
    return res.status(404).json({
      error: 'Товар не найден'
    });
  }

  res.json(product);
});

export default router;