import 'dotenv/config';
import app from './app.js';

if (!process.env.JWT_SECRET) {
  console.error('Не задан JWT_SECRET в .env');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`АгроМаркет API: http://localhost:${PORT}`);
});
