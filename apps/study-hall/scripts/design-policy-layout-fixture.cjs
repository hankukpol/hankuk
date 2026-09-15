const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const root = process.argv[2];
assert.ok(root, 'Pass the academy-template app worktree');
const cache = new Map();
let activeTab = 'attendance';
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const localRequire = id => {
    if (id === 'react') return { ...React, useState: value => React.useState(value === 'general' ? activeTab : value) };
    if (id === './ConfigurationReview') return { useConfigurationReview: () => ({ review: () => { throw new Error('No writes in layout fixture'); }, dialog: null }) };
    if (!id.startsWith('@/') && !id.startsWith('.')) return require(id);
    const base = id.startsWith('@/') ? path.join(root, id.slice(2)) : path.resolve(path.dirname(file), id);
    return load(['.tsx', '.ts'].map(ext => base + ext).find(fs.existsSync));
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: file })(localRequire, module, module.exports);
  return module.exports;
}
(async () => {
  const { AcademyPolicySettings } = load(path.join(root, 'components/settings/AcademyPolicySettings.tsx'));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const output = '.superloopy/evidence/frontend/2026-09-15-policy-layout-fixture';
  fs.mkdirSync(output, { recursive: true });
  try {
    const page = await browser.newPage();
    await page.goto('http://localhost:3000/login');
    const results = [];
    for (const width of [390, 768, 1280]) for (const tab of ['attendance', 'leave']) {
      activeTab = tab;
      await page.setViewportSize({ width, height: 912 });
      const html = renderToStaticMarkup(React.createElement(AcademyPolicySettings, { divisionSlug: 'police', initial: { policy: null, revision: '', periods: [], rules: [] } }));
      // Static layout fixture only: no policy saves or runtime workflow assertions.
      await page.evaluate(html => { document.body.innerHTML = `<main class="admin-shell p-4">${html}</main>`; }, html);
      const panel = page.locator(`#academy-policy-panel-${tab}`);
      const link = panel.locator('.admin-workspace-toolbar a').last();
      const button = page.getByRole('button', { name: '학원 규정 저장' });
      assert.ok(await link.isVisible());
      assert.ok((await link.boundingBox()).height >= 44);
      assert.equal(await button.getAttribute('type'), 'submit');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false);
      await page.screenshot({ path: `${output}/${tab}-${width}.png`, fullPage: true });
      results.push({ width, tab, overflow, href: await link.getAttribute('href') });
    }
    fs.writeFileSync(`${output}/audit.json`, JSON.stringify(results, null, 2));
    console.log('6 static policy layout checks passed; policy save workflow not exercised');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
