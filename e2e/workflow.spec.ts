import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdir, readFile } from 'node:fs/promises';

test('fresh sample completes create, import, source, check, review, export and persistence', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the sample' }).click();
  await expect(page.getByRole('heading', { name: 'Good to see you, Alex.' })).toBeVisible();
  await expect(
    page.locator('.sample-banner').getByText('Sample workspace', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'New course', exact: true }).click();
  await page.getByLabel('Course name').fill('Folio publishing workshop');
  await page.getByLabel('Software or product').fill('Folio');
  await page.getByRole('button', { name: 'Create course', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Folio publishing workshop', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Import lesson', exact: true }).first().click();
  await page.getByLabel('Lesson title').fill('Share your first page');
  await page
    .getByLabel('Lesson text', { exact: true })
    .fill('Open the Share menu and select Publish to web.');
  await page.getByRole('button', { name: 'Preview lesson' }).click();
  await expect(page.getByText('1 segments ready')).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Import lesson', exact: true })
    .click();
  await expect(page.getByRole('button', { name: /Share your first page/ })).toBeVisible();
  await page.getByRole('button', { name: 'Add a source' }).click();
  await page.getByLabel('Reference name').fill('Folio publishing reference');
  await page.getByLabel('Official source URL').fill('https://folio.example/publishing');
  await page.getByText('Use an authorized manual text capture').click();
  await page
    .getByLabel('Reference text')
    .fill(
      'To publish a page, open the Publish tab in the top-right menu and select Publish. The previous Publish to web option has been removed from Share.',
    );
  await page.getByLabel('I approve this source').check();
  await page.getByRole('button', { name: 'Validate & add source' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Run check', exact: true }).click();
  await expect
    .poll(
      async () => {
        const state = await (await page.request.get('/api/state')).json();
        return state.checks[0].status;
      },
      { timeout: 30000 },
    )
    .toBe('completed');
  const state = await (await page.request.get('/api/state')).json();
  const finding = state.findings.find((f: any) => f.lessonTitle === 'Share your first page');
  expect(finding).toBeTruthy();
  await page.goto(`/app/review/${finding.id}`);
  await expect(
    page.getByRole('heading', { name: 'Publishing has moved out of Share' }),
  ).toBeVisible();
  await expect(page.getByText('Fictional sample reference')).toBeVisible();
  await page
    .getByLabel('Proposed lesson replacement')
    .fill(
      'Open the Publish tab in the top-right menu and select Publish. Then copy the link for your learners.',
    );
  await page.getByRole('button', { name: 'Confirm update' }).click();
  await expect(page.getByRole('button', { name: 'Apply & recheck' })).toBeVisible();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Markdown An editable/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('lessonledger-worklist.md');
  const path = await file.path();
  expect(await readFile(path!, 'utf8')).toContain('Then copy the link for your learners.');
  await page.reload();
  await expect(page.getByLabel('Proposed lesson replacement')).toHaveValue(/Then copy the link/);
  await page.getByRole('button', { name: 'Apply & recheck' }).click();
  await expect
    .poll(
      async () => {
        const state = await (await page.request.get('/api/state')).json();
        return state.checks[0].status;
      },
      { timeout: 30000 },
    )
    .toBe('completed');
  const after = await (await page.request.get('/api/state')).json();
  expect(
    after.lessons.find((l: any) => l.title === 'Share your first page').segments[0].text,
  ).toContain('Then copy the link');
  expect(after.findings.find((f: any) => f.id === finding.id).status).toBe('confirmed');
  expect(errors).toEqual([]);
});

test('passwordless sign-in uses a real library token and persists an account', async ({ page }) => {
  await page.goto('/login');
  const email = `creator-${Date.now()}@example.test`;
  await page.getByLabel('Your name').fill('Taylor');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByText('Check your inbox.')).toBeVisible();
  let link = '';
  await expect
    .poll(async () => {
      for (const name of await readdir('data/mail')) {
        const mail = JSON.parse(await readFile(`data/mail/${name}`, 'utf8'));
        if (mail.to === email) {
          link = mail.text.match(/http[^\s]+/)?.[0] || '';
          break;
        }
      }
      return link;
    })
    .not.toBe('');
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Good to see you, Taylor.' })).toBeVisible();
  const state = await (await page.request.get('/api/state')).json();
  expect(state.workspace.demo).toBe(false);
  expect(state.lessons).toHaveLength(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Good to see you, Taylor.' })).toBeVisible();
});

test('two browser sessions cannot access each other’s API, evidence, or export', async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const pa = await a.newPage(),
    pb = await b.newPage();
  for (const page of [pa, pb]) {
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore the sample' }).click();
    await expect(page.getByRole('heading', { name: 'Good to see you, Alex.' })).toBeVisible();
  }
  const sa = await (await pa.request.get('/api/state')).json();
  const sb = await (await pb.request.get('/api/state')).json();
  expect(sa.workspace.id).not.toBe(sb.workspace.id);
  const response = await pb.request.patch(`/api/findings/${sa.findings[0].id}`, {
    headers: { origin: 'http://localhost:3000' },
    data: { status: 'confirmed' },
  });
  expect(response.status()).toBe(404);
  const exported = await (
    await pa.request.post('/api/exports', {
      headers: { origin: 'http://localhost:3000' },
      data: { format: 'csv' },
    })
  ).json();
  expect((await pb.request.get(`/api/exports/${exported.id}`)).status()).toBe(404);
  expect((await pb.request.get(`/api/blobs/${exported.blobId}`)).status()).toBe(404);
  await pb.goto(`/app/review/${sa.findings[0].id}`);
  await expect(pb.getByRole('heading', { name: 'Finding unavailable' })).toBeVisible();
  await a.close();
  await b.close();
});

for (const width of [390, 768, 1440])
  test(`responsive core screens, keyboard dialogs and accessibility at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1050 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Your software changes/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Explore the sample' }).click();
    await expect(page.getByRole('heading', { name: 'Good to see you, Alex.' })).toBeVisible();
    for (const route of [
      '/app',
      '/app/courses',
      '/app/review',
      '/app/sources',
      '/app/history',
      '/app/settings?tab=billing',
    ]) {
      await page.goto(route);
      await expect(page.locator('.page-heading')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const scan = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        scan.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      ).toEqual([]);
    }
    await page.goto('/app');
    await page.getByRole('button', { name: 'Import a lesson', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => document.querySelector('dialog')?.contains(document.activeElement)),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (width === 390) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      await page.getByRole('link', { name: 'Sources', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Go straight to the source.' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const dark = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(dark.violations.map((v) => v.id)).toEqual([]);
  });

test('stored hostile text stays inert and unauthorized writes fail', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore the sample' }).click();
  await expect(page.getByRole('heading', { name: 'Good to see you, Alex.' })).toBeVisible();
  const result = await page.request.post('/api/courses', {
    headers: { origin: 'http://localhost:3000' },
    data: { title: '<script>window.pwned=true</script>', product: 'Folio', description: '' },
  });
  expect(result.ok()).toBe(true);
  await page.goto('/app/courses');
  await expect(
    page.getByRole('heading', { name: '<script>window.pwned=true</script>' }),
  ).toBeVisible();
  expect(await page.evaluate(() => Object.hasOwn(window, 'pwned'))).toBe(false);
  expect(
    (
      await page.request.post('/api/checks', {
        headers: { origin: 'https://attacker.example' },
        data: { courseId: 'x' },
      })
    ).status(),
  ).toBe(403);
  await page.goto('/app/settings?tab=billing');
  await expect(page.getByRole('button', { name: 'Choose Starter' })).toBeDisabled();
  const current = await (await page.request.get('/api/state')).json();
  const reset = new Date(current.usage.reset).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  await expect(page.locator('.billing-usage')).toContainText(`Resets ${reset} UTC`);
  await page.keyboard.press('/');
  await expect(page.getByRole('textbox', { name: 'Search courses and findings' })).toBeFocused();
});
