import { chromium } from '@playwright/test';
import { mkdir, copyFile } from 'node:fs/promises';
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1050 },
  deviceScaleFactor: 1,
});
await mkdir('docs/images', { recursive: true });
await mkdir('public/images', { recursive: true });
await page.goto('http://localhost:3000');
await page.getByRole('button', { name: 'Explore the sample' }).click();
await page.getByRole('heading', { name: 'Good to see you, Alex.' }).waitFor();
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'docs/images/dashboard.png', fullPage: true });
await copyFile('docs/images/dashboard.png', 'public/images/dashboard.png');
const state = await (await page.request.get('http://localhost:3000/api/state')).json();
const finding = state.findings.find((f: any) => f.title === 'Publishing has moved out of Share');
await page.goto(`http://localhost:3000/app/review/${finding.id}`);
await page.getByRole('heading', { name: finding.title }).waitFor();
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'docs/images/review.png' });
await copyFile('docs/images/review.png', 'public/images/review.png');
for (const width of [390, 768, 1440]) {
  await page.setViewportSize({ width, height: 1050 });
  for (const [name, route] of [
    ['landing', '/'],
    ['dashboard', '/app'],
    ['review', `/app/review/${finding.id}`],
    ['billing', '/app/settings?tab=billing'],
  ]) {
    await page.goto(`http://localhost:3000${route}`);
    await page.locator('h1').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `docs/images/${name}-${width}.png`, fullPage: true });
  }
  await page.goto('http://localhost:3000/app');
  await page.getByRole('button', { name: 'Import a lesson', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: `docs/images/import-${width}.png` });
  await page.keyboard.press('Escape');
  if (width === 390) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('navigation', { name: 'Main navigation' }).waitFor();
    await page.screenshot({ path: 'docs/images/navigation-390.png', animations: 'disabled' });
    await page.keyboard.press('Escape');
  }
}
await browser.close();
console.log('Captured actual sample screens at 390, 768, and 1440 pixels.');
