import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const config = {
  demo:
    process.env.DEMO_MODE === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.DEMO_MODE !== 'false'),
  production: process.env.NODE_ENV === 'production',
  url: process.env.APP_URL || 'http://localhost:3000',
  database: process.env.DATABASE_URL,
  dataDir: resolve('data'),
  sqlite: process.env.SQLITE_PATH || 'data/lessonledger.sqlite',
  checks: Boolean(
    process.env.OPENAI_API_KEY &&
    process.env.OPENAI_MODEL &&
    Number(process.env.OPENAI_INPUT_USD_PER_MILLION) > 0 &&
    Number(process.env.OPENAI_OUTPUT_USD_PER_MILLION) > 0,
  ),
  billing: Boolean(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    process.env.STRIPE_STARTER_PRICE_ID &&
    process.env.STRIPE_STUDIO_PRICE_ID,
  ),
};
mkdirSync(config.dataDir, { recursive: true });
export function validateProduction() {
  if (!config.production || config.demo) return;
  const required = [
    'DATABASE_URL',
    'BETTER_AUTH_SECRET',
    'APP_URL',
    'SMTP_HOST',
    'EMAIL_FROM',
    'S3_BUCKET',
    'S3_ACCESS_KEY',
    'S3_SECRET_KEY',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing production configuration: ${missing.join(', ')}`);
  if (!config.url.startsWith('https://')) throw new Error('Production APP_URL requires HTTPS');
  if ((process.env.BETTER_AUTH_SECRET?.length || 0) < 32)
    throw new Error('Authentication secret must have at least 32 characters');
}
