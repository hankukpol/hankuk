import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const output = '.local/server-integration-20260915';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
try {
  const context = await browser.newContext({ baseURL: 'http://localhost:3000' });
  assert.ok((await context.request.post('/api/auth/login', { data: { email: 'admin-police@mock.local', password: 'test1234' } })).ok());
  await context.route('**/api/**', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 912 });
    for (const route of ['settings/rules', 'settings/rules?section=policy', 'phone-submissions', 'arrivals', 'settings/rules/arrivals', 'settings/templates']) {
      const response = await page.goto(`/police/admin/${route}`, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      assert.ok(!page.url().includes('/login'));
      if (route === 'settings/rules') assert.ok(await page.getByRole('link', { name: '관리규정·휴대폰', exact: true }).isVisible());
      if (route.includes('section=policy')) {
        for (const tab of ['교시·출결', '휴대폰', '휴무·경고']) {
          await page.getByRole('tab', { name: tab, exact: true }).click();
          assert.ok(await page.getByRole('button', { name: '학원 규정 저장' }).isVisible());
        }
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, `${route}/${width}`);
      results.push({ route, width, status: response.status(), overflow });
      await page.screenshot({ path: `${output}/${route.replaceAll(/[/?=]/g, '-')}-${width}.png`, fullPage: true });
    }
  }
  assert.deepEqual(errors, []);
  console.log(`${results.length} unified preview checks passed`);
} finally {
  fs.writeFileSync(`${output}/browser-checks.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
