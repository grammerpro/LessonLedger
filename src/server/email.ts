import nodemailer from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config';
export async function deliverEmail(input: {
  to: string;
  subject: string;
  text: string;
  key: string;
}) {
  if (config.demo) {
    const dir = join(config.dataDir, 'mail');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, `${input.key.replace(/[^a-zA-Z0-9-]/g, '')}.json`),
      JSON.stringify(input),
      { mode: 0o600 },
    );
    return;
  }
  if (!process.env.SMTP_HOST) throw new Error('Email is not configured');
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_PORT === '465',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    socketTimeout: 20000,
  });
  await transport.sendMail({
    from: process.env.EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    messageId: `<${input.key}@lessonledger.local>`,
  });
}
