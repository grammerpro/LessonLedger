import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { config, validateProduction } from './config';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { deliverEmail } from './email';

function demoSecret() {
  const path = join(config.dataDir, 'local-auth-secret');
  try {
    return readFileSync(path, 'utf8');
  } catch {
    try {
      writeFileSync(path, randomBytes(48).toString('hex'), { flag: 'wx', mode: 0o600 });
    } catch {}
    return readFileSync(path, 'utf8');
  }
}
function createAuth() {
  validateProduction();
  return betterAuth({
    appName: 'LessonLedger',
    baseURL: config.url,
    secret: process.env.BETTER_AUTH_SECRET || (config.demo ? demoSecret() : undefined),
    database: config.database
      ? new Pool({ connectionString: config.database })
      : new Database(config.sqlite),
    trustedOrigins: [config.url],
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, window: 60, max: 10, storage: 'database' },
    plugins: [
      magicLink({
        expiresIn: 600,
        storeToken: 'hashed',
        sendMagicLink: async ({ email, url }) => {
          await deliverEmail({
            to: email,
            subject: 'Your LessonLedger sign-in link',
            text: `Sign in to LessonLedger:\n\n${url}\n\nThis link expires in 10 minutes. If you did not request it, ignore this email.`,
            key: crypto.randomUUID(),
          });
        },
      }),
    ],
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (instance ??= createAuth());
}
