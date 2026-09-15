import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const output = process.env.TABLE_AUDIT_OUTPUT ?? '.superloopy/evidence/frontend/2026-09-15-table-text';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
const errors = [];
try {
  const context = await browser.newContext({ baseURL: 'http://localhost:3000' });
  assert.ok((await context.request.post('/api/auth/login', { data: { email: 'admin-police@mock.local', password: 'test1234' } })).ok());
  await context.route('**/api/**', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(120000);
  page.on('pageerror', e => errors.push(e.message));
  for (const width of (process.env.TABLE_AUDIT_WIDTHS ?? '390,768,1280').split(',').map(Number)) {
    await page.setViewportSize({ width, height: 912 });
    for (const route of (process.env.TABLE_AUDIT_ROUTES ?? 'students,attendance,phone-submissions,points,points/rules,warnings,announcements,staff,interviews,leave,payments,exams,settings/periods,settings/rules?section=policy').split(',')) {
      const response = await page.goto(`/police/admin/${route}`, { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200, route);
      const check = async label => {
        const result = await page.evaluate(() => {
          const nodes = [...document.querySelectorAll('table :is(.admin-badge, .admin-status-chip, span[class*="rounded"], a.admin-button, button.admin-button, .admin-icon-button)')].filter(el => el.getBoundingClientRect().height > 0 && !el.closest('[aria-pressed], [role="switch"]'));
          return { count: nodes.length, failures: nodes.flatMap(el => {
            const s = getComputedStyle(el);
            const border = parseFloat(s.borderTopWidth) > 0 && s.borderTopColor !== 'rgba(0, 0, 0, 0)';
            return border || s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.boxShadow !== 'none' ? [{ text: el.textContent, cls: el.className, background: s.backgroundColor, border: s.borderTopColor }] : [];
          }) };
        });
        results.push({ route, width, label, ...result });
        assert.deepEqual(result.failures, [], `${route}/${label}/${width}`);
      };
      await check('initial');
      const tabs = page.getByRole('tab');
      const count = await tabs.count();
      for (let i = 0; i < count; i++) {
        const tab = tabs.nth(i);
        if (!(await tab.isVisible()) || !(await tab.isEnabled())) continue;
        const name = await tab.textContent();
        await tab.click();
        await check(name);
      }
      if (['students', 'points/rules', 'phone-submissions'].includes(route)) await page.screenshot({ path: `${output}/${route.replaceAll('/', '-')}-${width}.png`, fullPage: true });
    }
  }
  assert.deepEqual(errors, []);
} finally {
  fs.writeFileSync(`${output}/audit.json`, JSON.stringify(results, null, 2));
  fs.writeFileSync(`${output}/runtime-errors.json`, JSON.stringify(errors, null, 2));
  await browser.close();
}
console.log(`${results.length} page/tab/viewport checks passed`);
