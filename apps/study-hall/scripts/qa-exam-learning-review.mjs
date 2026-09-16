import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const info = JSON.parse(fs.readFileSync('.local/exam-preview/runtime.json', 'utf8'));
assert.equal(info.fixtureOnly, true);
const out = '.superloopy/evidence/frontend/2026-09-17-learning-review';
fs.mkdirSync(out, {recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true});
const cases = [], errors = [];
let page;
try {
  const context = await browser.newContext({baseURL:info.baseUrl,viewport:{width:1280,height:1000}});
  assert.equal((await context.request.post('/api/auth/login',{data:{email:'admin-police@mock.local',password:'local-preview'}})).status(),200);
  const endpoint = '/api/police/exam-analysis-preview/learning?studentId=preview-police-s0';
  const original = await (await context.request.get(endpoint)).json();
  const payload = structuredClone(original), typeId = 'preview-police-monthly';
  const policy = payload.document.policies[0];
  // Inject only this browser's response. Neither policy nor historical marks are saved.
  payload.document.policies = [{...policy,effectiveFrom:'2026-01-01',value:{...policy.value,timeTracking:true,timeLimits:{[typeId]:100}}},{...policy,id:'current-test-policy',effectiveFrom:'2026-09-17',value:{...policy.value,timeTracking:true,timeLimits:{[typeId]:45}}}];
  const session = payload.sessions.find(s=>s.examTypeId===typeId&&s.date==='2026-09-16');
  payload.document.times = [{id:'review-test',studentId:'preview-police-s0',sessionId:session.id,totalMinutes:95,subjectMinutes:{},ranOut:false,at:'2026-09-17T00:00:00Z',actor:'local-test'}];
  const subject = payload.examTypes.find(t=>t.id===typeId).subjects[0].id;
  const ambiguous = payload.items.find(i=>i.examTypeId===typeId&&i.subjectId===subject&&i.date==='2026-09-16'&&i.correct===false);
  ambiguous.answerKey = '1,2';
  const submitted = [];
  page = await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/police/exam-analysis-preview/learning?*', async route => {
    if (route.request().method()==='POST') submitted.push(route.request().postDataJSON().command);
    await route.fulfill({json:payload});
  });
  const base='/police/admin/exams/preview/students/preview-police-s0';
  await page.goto(base+'?kind=regular&examTypeId='+typeId+'&examDate=2026-09-16');
  await page.getByText('풀이시간 점검 · 선택 입력',{exact:true}).click();
  const timeRow = page.getByRole('table',{name:'최근 시간 기록',exact:true}).locator('tbody tr').first();
  assert.equal(await timeRow.locator('th,td').nth(1).textContent(),'100분');
  assert.equal(await timeRow.locator('th,td').nth(4).textContent(),'다음 실전에서 시간 배분 유지');
  cases.push('Historical exam uses its own 100-minute rule, not the current 45-minute rule');
  await page.goto(base+'?kind=morning&examTypeId=preview-police-morning&from=2026-09-01&to=2026-09-30');
  await page.getByText('풀이시간 점검 · 선택 입력',{exact:true}).click();
  const checkbox=page.getByLabel('시간이 부족해 다 풀지 못함');await checkbox.check();
  const dates=page.getByLabel('시간 기록 시험일',{exact:true});
  const active=await dates.inputValue(),alternatives=await dates.locator('option').evaluateAll(o=>o.map(n=>n.value));
  const target=alternatives.find(x=>x!==active);assert.ok(target);
  await dates.selectOption(target);assert.equal(await checkbox.isChecked(),false);
  await page.getByLabel('총 소요시간 (분)',{exact:true}).fill('20');
  await page.getByRole('button',{name:'시간 기록 저장',exact:true}).click();
  await page.getByRole('status').filter({hasText:'저장했습니다.'}).waitFor();
  assert.equal(submitted.at(-1).sessionId,target);assert.equal(submitted.at(-1).ranOut,false);
  cases.push('Changing exam clears the time-shortage checkbox and submits the correct new draft');
  await page.goto(base+'?kind=regular&examTypeId='+typeId+'&examDate=2026-09-16');
  await page.getByRole('tab',{name:'과목별 분석',exact:true}).click();
  const topics=page.getByRole('table',{name:'문항별 진도 비교',exact:true});
  const headers=await topics.locator('thead th').allTextContents();
  assert.ok(headers.includes('응시 회차')&&headers.includes('비교 회차'));
  for(const width of [390,768,1280]) {
    await page.setViewportSize({width,height:1000});await topics.scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.equal(await topics.evaluate(t=>t.scrollWidth>t.parentElement.clientWidth+1),false);
    await page.screenshot({path:`${out}/paired-sessions-${width}.png`});
  }
  cases.push('Separate taken and paired session columns fit 390, 768 and 1280px');
  await page.getByRole('button',{name:`${ambiguous.itemNo}번 재풀이`,exact:true}).first().click();
  const dialog=page.getByRole('dialog');
  await dialog.getByText(/복수 정답의 인정 방식/).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'채점하고 기록',exact:true}).isDisabled(),true);
  assert.equal(await dialog.getByLabel('재풀이 답안',{exact:true}).isDisabled(),true);
  for(const width of [390,768,1280]) {
    await page.setViewportSize({width,height:1000});
    await page.waitForFunction(()=>{const r=document.querySelector('[role=dialog]')?.getBoundingClientRect();return r&&r.x>=0&&r.right<=innerWidth+1;});
    await page.screenshot({path:`${out}/multiple-key-${width}.png`});
  }
  await page.keyboard.press('Escape');
  await page.getByLabel(`${ambiguous.date} ${ambiguous.itemNo}번 복습 선택`,{exact:true}).first().check();
  assert.equal(await page.getByRole('button',{name:'선택 1문항 예약',exact:true}).first().isDisabled(),false);
  assert.equal(submitted.filter(c=>c.action==='attempt').length,0);
  cases.push('Ambiguous multiple keys cannot create a false grade; bulk review scheduling stays available');
  const normal=payload.items.find(i=>i.examTypeId===typeId&&i.subjectId===subject&&i.date==='2026-09-16'&&i.correct===false&&i.id!==ambiguous.id);
  await page.getByRole('button',{name:`${normal.itemNo}번 재풀이`,exact:true}).first().click();
  await dialog.getByLabel('재풀이 답안',{exact:true}).selectOption(Object.keys(normal.choices)[0]);
  assert.equal(await dialog.getByRole('button',{name:'채점하고 기록',exact:true}).isDisabled(),false);
  await page.keyboard.press('Escape');cases.push('Ordinary single-answer reattempt input remains enabled');
  const student=await browser.newContext({baseURL:info.baseUrl,viewport:{width:390,height:1000}});
  assert.equal((await student.request.post('/api/auth/student-login',{data:{division:'police',studentNumber:'98001',name:'테스트 김서준'}})).status(),200);
  const own=await student.request.get(endpoint);assert.equal(own.status(),200);
  const personal=await own.json();assert.equal(personal.document.audit.length,0);assert.ok(personal.document.reviews.every(r=>r.studentId==='preview-police-s0'));
  assert.ok([401,403].includes((await student.request.get(endpoint.replace('s0','s1'))).status()));
  assert.ok([401,403].includes((await context.request.get('/api/fire/exam-analysis-preview/learning?studentId=preview-fire-s0')).status()));
  const studentPage=await student.newPage();studentPage.on('pageerror',e=>errors.push(e.message));
  await studentPage.goto('/police/student/exams/preview?kind=morning&examTypeId=preview-police-morning&from=2026-09-01&to=2026-09-30');
  await studentPage.getByRole('table',{name:'문항별 진도 비교',exact:true}).scrollIntoViewIfNeeded();
  assert.equal(await studentPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await studentPage.screenshot({path:`${out}/student-topics-390.png`});await student.close();
  cases.push('Student mobile and own-record-only access; cross-academy access remains denied');
  assert.deepEqual(errors,[]);
  const after=await(await context.request.get(endpoint)).json();assert.deepEqual(after.document,original.document);
  fs.writeFileSync(out+'/browser-result.json',JSON.stringify({cases,errors,responseInjection:true,savedOperatingData:false},null,2));
  console.log(JSON.stringify({passed:cases.length,errors}));
} catch(error) {if(page) await page.screenshot({path:out+'/failure.png',fullPage:true});throw error;} finally {await browser.close();}
