import 'dotenv/config';
import { spawn } from 'node:child_process';
import { migrate } from './migrate';
import { db } from '../src/server/db';
import { validateProduction } from '../src/server/config';
validateProduction();
await migrate();
await db.destroy();
const production = process.argv.includes('--production');
const children = [
  spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', production ? 'start' : 'dev', '--hostname', '127.0.0.1'],
    { stdio: 'inherit', env: process.env, windowsHide: true },
  ),
  spawn(process.execPath, ['--import', 'tsx', 'src/server/worker.ts'], {
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  }),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 1500).unref();
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
for (const child of children)
  child.on('exit', (code) => {
    if (!stopping) stop(code || 0);
  });
