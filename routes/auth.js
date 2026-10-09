import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут' },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

function createToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, process.env.JWT_SECRET, {
    algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '2h',
  });
}

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' ||
      !email.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Поля name, email и password обязательны' });
  }
  if (password.length < 8 || Buffer.byteLength(password) > 72) {
    return res.status(400).json({ error: 'Пароль должен содержать минимум 8 символов и не более 72 байт' });
  }
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
     RETURNING id, name, email, role, created_at`,
    [name.trim(), email.trim().toLowerCase(), hash],
  );
  const user = rows[0];
  res.status(201).json({ user, token: createToken(user) });
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Поля email и password обязательны' });
  }
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
  const user = rows[0];
  if (!user || Buffer.byteLength(password) > 72 || !await bcrypt.compare(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }
  const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role, created_at: user.created_at };
  res.json({ user: safeUser, token: createToken(user) });
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, email, role, created_at FROM users WHERE id = $1', [req.user.id],
  );
  if (!rows.length) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json(rows[0]);
});

export default router;
