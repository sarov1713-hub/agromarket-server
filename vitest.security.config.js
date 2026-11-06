import { defineConfig } from 'vitest/config';

// Отдельная проверка HTTP middleware без PostgreSQL. Основной npm test остаётся интеграционным.
export default defineConfig({ test: {
  include: ['tests/security.test.js'],
  env: { NODE_ENV: 'test', JWT_SECRET: 'isolated-security-test-only', CORS_ORIGINS: 'http://localhost:5173' },
} });
