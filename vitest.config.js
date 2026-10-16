import { defineConfig } from 'vitest/config';
import { testEnv } from './tests/loadEnv.js';

export default defineConfig({
  test: {
    env: testEnv,
    include: ['tests/*.test.js'],
    globalSetup: './tests/globalSetup.js',
    setupFiles: ['./tests/setup.js'],
    fileParallelism: false,
    pool: 'forks',
    isolate: true,
    testTimeout: 10000,
    hookTimeout: 15000,
    coverage: {
      provider: 'v8',
      include: ['app.js', 'routes/**', 'middleware/**'],
      reporter: ['text', 'html', 'json', 'json-summary'],
    },
  },
});
