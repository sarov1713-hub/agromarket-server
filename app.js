import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRouter from './routes/auth.js';
import { logger } from './middleware/logger.js';
import productsRouter from './routes/products.js';
import ordersRouter from './routes/orders.js';
import { pool } from './db/pool.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const VERSION = (process.env.RENDER_GIT_COMMIT || 'local').slice(0, 7);
app.set('trust proxy', 1);
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map((origin) => origin.trim()).filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
  })
);

app.use(express.json({ limit: '10kb' }));
if (process.env.NODE_ENV !== 'test') {
  app.use(logger);
}

app.get('/', (req, res) => {
  res.send('АгроМаркет API работает');
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok', version: VERSION });
  } catch {
    res.status(503).json({ status: 'error', db: 'unavailable', version: VERSION });
  }
});

app.get('/api/about', (req, res) => {
  res.json({
    name: 'АгроМаркет',
    version: '1.0',
    author: 'Шаров Александр Сергеевич',
  });
});

app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);

app.use((req, res) => {
  res.status(404).json({
    error: `Маршрут ${req.method} ${req.originalUrl} не найден`,
  });
});

app.use(errorHandler);

export default app;
