import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const info = JSON.parse(fs.readFileSync('.local/exam-preview/runtime.json', 'utf8'));
assert.equal(info.fixtureOnly, true);
const out = '.superloopy/evidence/frontend/2026-09-17-learning-followup';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ baseURL: info.baseUrl, viewport: { width: 1280, height: 1000 } });
const page = await context.newPage(), cases = [], errors = [];
page.setDefaultTimeout(90000);
page.on('pageerror', error => errors.push(error.message));
const base = '/police/admin/exams/preview/students/preview-police-s0';
try {
  assert.equal((await context.request.post('/api/auth/login', { data: { email: 'admin-police@mock.local', password: 'local-preview' } })).status(), 200);
  const payload = await (await context.request.get('/api/police/exam-analysis-preview/learning?studentId=preview-police-s0')).json();
  assert.ok(payload.topicSessions.length > 0);
  await page.goto(base + '?kind=regular&examTypeId=preview-police-monthly&examDate=2026-09-16', { timeout: 120000 });
  await page.getByRole('tab', { name: '과목별 분석', exact: true }).click();
  const topics = page.getByRole('table', { name: '문항별 진도 비교', exact: true });
  const open = topics.getByRole('button', { name: /오답 \d+문항 보기/ }).first();
  const expected = Number((await open.textContent()).match(/\d+/)[0]);
  await open.click();
  const review = page.getByLabel('선택 진도 복습', { exact: true });
  const rows = review.getByRole('table', { name: '복습 대상과 최근 결과', exact: true }).locator('tbody tr');
  assert.equal(await rows.count(), expected);
  const dates = await rows.locator('th').allTextContents();
  assert.ok(new Set(dates).size > 1, 'Cumulative topic review must include older exam dates');
  await review.getByRole('button', { name: '오답 전체 선택', exact: true }).click();
  await review.getByRole('button', { name: `선택 ${expected}문항 예약`, exact: true }).waitFor();
  cases.push('Topic summary opens every wrong question across historical exam dates, with matching bulk selection');
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await review.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${out}/topic-review-${width}.png` });
  }
  const practice = review.getByRole('button', { name: /\d+번 재풀이/ }).first();
  await practice.click();
  await page.getByRole('dialog').getByLabel('재풀이 답안', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await review.getByRole('button', { name: '진도 복습 닫기', exact: true }).click();
  assert.equal(await review.count(), 0);
  cases.push('Responsive topic review, reattempt dialog and close action');

  await page.goto(base + '?kind=morning&examTypeId=preview-police-morning&from=2026-09-14&to=2026-09-16');
  await page.getByRole('tab', { name: '경찰학', exact: true }).click();
  await page.getByRole('table', { name: '문항별 진도 비교', exact: true }).getByText('미응시 / 채점 자료 없음', { exact: true }).first().waitFor();
  assert.equal(await page.getByRole('table', { name: '문항별 진도 비교', exact: true }).getByRole('button', { name: /오답/ }).count(), 0);
  cases.push('Untaken mapped subject is marked missing participation, without fabricated wrong questions');
  await page.screenshot({ path: `${out}/untaken-topic.png` });

  await page.goto('/police/admin/exams/preview/learning');
  await page.getByRole('tab', { name: '분석 기준', exact: true }).click();
  await page.getByRole('button', { name: '기준 변경 미리보기', exact: true }).click();
  await page.getByLabel('최소 비교 문항 수', { exact: true }).fill('15');
  await page.getByLabel('월 1회 실전형 검증 (100문항·100분) 제한 시간 (분, 선택)', { exact: true }).fill('');
  await page.getByRole('button', { name: '변경 내용 미리보기', exact: true }).click();
  const preview = page.getByRole('table', { name: '설정 변경 미리보기', exact: true });
  assert.deepEqual(await preview.locator('thead th').allTextContents(), ['항목', '변경 전', '변경 후']);
  const limit = preview.getByRole('row').filter({ hasText: '월 1회 실전형 검증' });
  assert.ok((await limit.innerText()).includes('100분'));
  assert.ok((await limit.innerText()).includes('미설정'));
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForFunction(() => { const d = document.querySelector('[role=dialog]'); if (!d) return false; const r = d.getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth + 1; });
    await page.screenshot({ path: `${out}/setting-preview-${width}.png` });
  }
  await page.keyboard.press('Escape');
  cases.push('Before/after columns show changed thresholds and removed time limits without saving the draft');
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${out}/browser-result.json`, JSON.stringify({ cases, errors }, null, 2));
  console.log(JSON.stringify({ passed: cases.length, errors }));
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png`, fullPage: true });
  throw error;
} finally { await browser.close(); }
