import './loadEnv.js';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertTestDatabase } from '../db/testSafety.js';

export default function setup() {
  assertTestDatabase();
  execSync('npm run db:init', {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: 'inherit',
  });
}
