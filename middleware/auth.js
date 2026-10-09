import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const match = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') ?? '');
  if (!match) return res.status(401).json({ error: 'Требуется вход в систему' });
  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const id = Number(payload.sub);
    if (!Number.isSafeInteger(id) || id <= 0 || !['user', 'admin'].includes(payload.role)) {
      return res.status(401).json({ error: 'Недействительный токен' });
    }
    req.user = { id, role: payload.role };
    next();
  } catch (error) {
    res.status(401).json({ error: error.name === 'TokenExpiredError'
      ? 'Срок действия токена истёк, войдите снова' : 'Недействительный токен' });
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) return res.status(403).json({ error: 'Недостаточно прав' });
    next();
  };
}
