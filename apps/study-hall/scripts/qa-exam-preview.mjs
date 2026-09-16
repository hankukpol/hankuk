import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const info=JSON.parse(fs.readFileSync('.local/exam-preview/runtime.json','utf8'));
assert.equal(info.fixtureOnly,true);assert.ok(['localhost','127.0.0.1'].includes(new URL(info.baseUrl).hostname));
const manifest=JSON.parse(fs.readFileSync(path.join(info.mockDir,'manifest.json'),'utf8')), fixture=manifest[0];
const evidence=path.resolve('.superloopy/evidence/frontend/2026-09-16-exam-preview-paging');fs.mkdirSync(evidence,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({baseURL:info.baseUrl,viewport:{width:1280,height:960}});
context.setDefaultTimeout(60000);
const failures=[],checks=[];const mark=(name)=>{checks.push(name);console.log(`PASS ${name}`);};
const screenshot=async(page,options)=>{await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.waitForTimeout(80);await page.screenshot(options);};
const api=async(url)=>{const response=await context.request.get(url,{timeout:120000});assert.equal(response.status(),200,`${url}: ${await response.text()}`);return response.json();};
try {
 const login=await context.request.post('/api/auth/login',{data:{email:fixture.adminEmail,password:'local-preview'},timeout:120000});assert.equal(login.status(),200);mark('local admin login');
 const regularQuery=new URLSearchParams({examTypeId:fixture.regularTypeId,examDate:fixture.to,studentId:fixture.studentId});
 const morningQuery=new URLSearchParams({examTypeId:fixture.morningTypeId,from:fixture.from,to:fixture.to,studentId:fixture.studentId});
 const baseline=await api(`/api/police/exams/analysis/student/${fixture.studentId}?${regularQuery}`);
 const result=await api(`/api/police/exam-analysis-preview/regular?${regularQuery}`);
 assert.deepEqual(result.regular,baseline.report);assert.ok(result.items.every(i=>i.responseCount===12));assert.ok(result.counseling);assert.ok(result.records.some(r=>r.source.startsWith('입력 성적')));mark('legacy totals/ranks/targets unchanged; manual scores retained');
 const morning=await api(`/api/police/exam-analysis-preview/morning?${morningQuery}`);
 assert.ok(morning.comparisons.some(r=>r.my===null&&r.external!==null));assert.ok(morning.items.length>0);mark('absence preserves cohort average; item enrichment available');
 for(const [name,url,status] of [
  ['tenant isolation',`/api/fire/exam-analysis-preview/regular?${regularQuery}`,403],
  ['foreign student',`/api/police/exam-analysis-preview/regular?${new URLSearchParams({...Object.fromEntries(regularQuery),studentId:manifest[1].studentId})}`,404],
  ['range validation',`/api/police/exam-analysis-preview/morning?${morningQuery}&from=2025-01-01`,400],
  ['date validation',`/api/police/exam-analysis-preview/regular?${regularQuery}&examDate=2026-02-30`,400],
 ]) {const r=await context.request.get(url);assert.equal(r.status(),status,name);mark(name);}
 const before=JSON.stringify(baseline);
 const page=await context.newPage();page.on('pageerror',error=>failures.push(error.message));
 const personalPath=`/police/admin/exams/preview/students/${fixture.studentId}?kind=regular&${regularQuery}`;
 await page.goto(personalPath,{waitUntil:'domcontentloaded',timeout:180000});await page.locator('[data-report-root]').waitFor();
 assert.equal(await page.getByRole('tablist',{name:'개선 성적 분석 항목'}).getByRole('tab').count(),3);
 assert.equal(await page.locator('[data-score-strip] > div').count(),4);
 assert.equal(await page.locator('[data-score-strip]').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),4);
 assert.ok(!(await page.getByRole('table',{name:'문항별 상세 분석',exact:true,includeHidden:true}).isVisible()));
 assert.ok(await page.getByRole('img',{name:'과목별 득점률 비교. 문항 단원별 정답률이 아닙니다.',exact:true}).isVisible());
 await page.getByRole('tab',{name:'회차별 성적',exact:true}).click();
 assert.ok(!(await page.getByRole('table',{name:'문항별 상세 분석',exact:true,includeHidden:true}).isVisible()));
 assert.ok(await page.getByRole('table',{name:'회차별 성적 비교',exact:true}).isVisible());
 await page.getByRole('tab',{name:'성적 요약',exact:true}).click();
 assert.deepEqual(await page.locator('#preview-main-panel-results > section').evaluateAll(els=>els.map(e=>e.id)),['subjects','overview','rank','diagnosis'].map(id=>'preview-tabs-panel-'+id));
 assert.equal(await page.getByRole('table',{name:'문항별 상세 분석',exact:true,includeHidden:true}).locator('thead tr').first().locator('th').first().innerText(),'번호');
 assert.ok(!(await page.locator('[id^="preview-item-"]').first().locator('td').first().innerText()).includes('/'));
 assert.ok(await page.getByRole('table',{name:'복습 우선순위',exact:true}).isVisible());
 assert.ok(await page.getByRole('table',{name:'총점과 목표',exact:true}).isVisible());
 await page.getByRole('tab',{name:'문항 분석',exact:true}).click();
 assert.ok(await page.getByRole('columnheader',{name:'시험 응시자 정답률',exact:true}).isVisible());
 assert.ok(await page.getByRole('columnheader',{name:'우리 학원 정답률',exact:true}).isVisible());
 await page.getByRole('tab',{name:'성적 요약',exact:true}).click();
 assert.ok((await page.getByRole('img',{name:'과목별 득점률 비교. 문항 단원별 정답률이 아닙니다.',exact:true}).boundingBox()).height>=380);
 mark('seven comments: section order, repeated date removal, source labels, larger radar, review and rank tables');
 mark('reference composition: four scores, inline choices, radar, three report tabs');
 const tabs=['성적 요약','회차별 성적','문항 분석'];
 for(const label of tabs) {await page.getByRole('tab',{name:label,exact:true}).click();await screenshot(page,{path:path.join(evidence,`admin-regular-${label}-1280.png`),fullPage:true});}
 await page.getByRole('tab',{name:'성적 요약',exact:true}).click();
 const jump=page.getByRole('button',{name:/번 확인/}).first();if(await jump.count()){await jump.click();await page.getByRole('tabpanel',{name:'문항 분석',exact:true}).waitFor();await page.waitForFunction(()=>document.activeElement?.id.startsWith('preview-item-'));mark('review item navigation and keyboard focus');}
 for(const width of [390,768,1280,1874]) {
  await page.setViewportSize({width,height:960});
  await page.getByRole('tab',{name:'성적 요약',exact:true}).click();
  await screenshot(page,{path:path.join(evidence,`admin-overview-${width}.png`),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`document overflow ${width}`);
  await page.getByRole('tab',{name:'문항 분석',exact:true}).click();
  if(width<768)await page.getByRole('button',{name:/번 선택률 보기/}).first().click();
  else assert.ok(await page.getByRole('columnheader',{name:'선택지별 선택비율',exact:true}).isVisible());
  await screenshot(page,{path:path.join(evidence,`admin-items-${width}.png`),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 }
 mark('admin 390/768/1280 and choice expansion');
 await page.getByLabel('문항 필터',{exact:true}).selectOption('wrong');
 const popupPromise=page.waitForEvent('popup');await page.getByRole('button',{name:'선택 과목 A4 인쇄 / PDF 저장',exact:true}).click();const popup=await popupPromise;
 await popup.getByRole('button',{name:'인쇄 / PDF 저장',exact:true}).waitFor();
 const printed=await popup.locator('body').innerText();assert.ok(!printed.includes('관리자 상담 참고'));assert.equal(await popup.locator('[id^="preview-item-"]').count(),20);assert.equal(await popup.locator('tbody[data-print-item]').count(),20);assert.ok(printed.includes('회차별 추이'));
 await popup.pdf({path:path.join(evidence,'personal-full.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});
 await screenshot(popup,{path:path.join(evidence,'personal-print.png'),fullPage:true});await popup.close();
 assert.equal(await page.getByLabel('문항 필터',{exact:true}).inputValue(),'wrong');mark('full PDF includes all items and tabs, excludes counseling, restores filter');
 const summaryPromise=page.waitForEvent('popup');await page.getByRole('button',{name:'선택 과목 학습 요약 인쇄',exact:true}).click();const summary=await summaryPromise;await summary.getByRole('button',{name:'인쇄 / PDF 저장',exact:true}).waitFor();
 const summaryText=await summary.locator('body').innerText();assert.ok(summaryText.includes('복습 대상 배점'));assert.ok(!summaryText.includes('문항별 채점과 선택률'));
 await summary.pdf({path:path.join(evidence,'personal-summary.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});await summary.close();mark('summary PDF');
 const morningPath=`/police/admin/exams/preview/students/${fixture.studentId}?kind=morning&${morningQuery}`;
 await page.goto(morningPath,{waitUntil:'domcontentloaded'});await page.locator('[data-report-root]').waitFor();
 await page.getByRole('tab',{name:'성적 요약',exact:true}).click();
 assert.ok(await page.getByRole('table',{name:'아침시험 응시 현황',exact:true}).isVisible());
 assert.equal(await page.getByRole('table',{name:'총점과 목표',exact:true}).count(),0);
 assert.deepEqual(await page.locator('#preview-main-panel-results > section').evaluateAll(els=>els.map(e=>e.id)),['subjects','overview','rank','diagnosis'].map(id=>'preview-tabs-panel-'+id));
 const morningSelected=await page.getByLabel('분석 과목',{exact:true}).inputValue();
 const expectedMorning=morning.morning.subjects.find(s=>s.subjectId===morningSelected);
 assert.ok((await page.getByRole('table',{name:'아침시험 응시 현황',exact:true}).innerText()).includes(expectedMorning.attended+' / '+expectedMorning.expected+'회'));
 for(const width of [390,768,1280,1874]) {await page.setViewportSize({width,height:960});await screenshot(page,{path:path.join(evidence,'morning-results-'+width+'.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await page.getByRole('tab',{name:'문항 분석',exact:true}).click();
 assert.equal(await page.locator('[id^="preview-item-"]').count(),20);
 assert.ok(await page.getByLabel('문항 시험일',{exact:true}).locator('option').count()>1);
 await page.getByLabel('문항 시험일',{exact:true}).selectOption({index:1});
 const beforePrintDate=await page.getByLabel('문항 시험일',{exact:true}).inputValue();
 const morningPrintEvent=page.waitForEvent('popup');await page.getByRole('button',{name:'선택 과목 A4 인쇄 / PDF 저장',exact:true}).click();const morningPrint=await morningPrintEvent;await morningPrint.getByRole('button',{name:'인쇄 / PDF 저장',exact:true}).waitFor();
 assert.equal(await morningPrint.locator('tbody[data-print-item]').count(),morning.items.filter(i=>i.subjectId===morningSelected).length);
 assert.ok((await morningPrint.locator('body').innerText()).includes('응시 현황과 순위'));
 assert.ok(!(await morningPrint.locator('body').innerText()).includes('관리자 상담 참고'));
 await morningPrint.pdf({path:path.join(evidence,'morning-full.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});await morningPrint.close();assert.equal(await page.getByLabel('문항 시험일',{exact:true}).inputValue(),beforePrintDate);assert.equal(await page.locator('[id^="preview-item-"]').count(),20);
 mark('morning period attendance, matching layout, multi-date groups and complete print');
 await page.getByRole('tab',{name:'회차별 성적',exact:true}).click();await screenshot(page,{path:path.join(evidence,'admin-morning-trend.png'),fullPage:true});
 await page.getByRole('button',{name:'이번 달',exact:true}).click();await page.locator('[data-report-root]').waitFor();mark('morning date shortcut and trends');
 await page.goto(`/police/admin/exams/preview?kind=regular&examTypeId=${fixture.regularTypeId}&examDate=${fixture.to}`,{waitUntil:'domcontentloaded'});await page.locator('[data-report-root]').waitFor();await page.getByRole('tab',{name:'문항 분석',exact:true}).click();await page.getByLabel('외부 대비 부족한 문항순').check();await screenshot(page,{path:path.join(evidence,'cohort-items.png'),fullPage:true});await page.getByRole('tab',{name:'성적 요약',exact:true}).click();assert.equal(await page.getByRole('link',{name:'개인 분석',exact:true}).count(),12);mark('cohort gap sorting and personal links');
 assert.equal(JSON.stringify(await api(`/api/police/exams/analysis/student/${fixture.studentId}?${regularQuery}`)),before);mark('legacy API unchanged after interactions');
 await page.goto(personalPath.replace(`examDate=${fixture.to}`,'examDate=2026-01-01'),{waitUntil:'domcontentloaded'});await page.locator('[data-report-root]').waitFor();assert.ok((await page.getByRole('tabpanel',{name:'성적 요약',exact:true}).innerText()).includes('분석 자료가 없습니다'));mark('empty session renders an explanation');
 let failNext=true;
 await page.route('**/api/police/exam-analysis-preview/regular?*',route=>{if(failNext){return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'테스트 조회 오류'})});}return route.continue();});
 await page.goto(personalPath,{waitUntil:'domcontentloaded'});await page.getByRole('alert').filter({hasText:'테스트 조회 오류'}).waitFor();failNext=false;await page.getByRole('button',{name:'다시 시도',exact:true}).click();await page.locator('[data-report-root]').waitFor();await page.unroute('**/api/police/exam-analysis-preview/regular?*');mark('error state recovers through retry');
 const studentContext=await browser.newContext({baseURL:info.baseUrl});studentContext.setDefaultTimeout(60000);
 const studentLogin=await studentContext.request.post('/api/auth/student-login',{data:{division:'police',studentNumber:fixture.studentNumber,name:fixture.studentName},timeout:120000});assert.equal(studentLogin.status(),200);
 const ownResponse=await studentContext.request.get(`/api/police/exam-analysis-preview/regular?${regularQuery}`);assert.equal(ownResponse.status(),200);const own=await ownResponse.json();assert.ok(!Object.hasOwn(own,'counseling'));assert.ok(!Object.hasOwn(own,'regularCohort'));
 assert.equal((await studentContext.request.get(`/api/police/exam-analysis-preview/regular?examTypeId=${fixture.regularTypeId}`)).status(),401);
 assert.equal((await studentContext.request.get(`/api/police/exam-analysis-preview/regular?${regularQuery}&studentId=preview-police-s1`)).status(),403);mark('student own-only access; no admin counseling payload');
 const studentPage=await studentContext.newPage();studentPage.on('pageerror',e=>failures.push(e.message));
 await studentPage.goto(`/police/student/exams/preview?kind=regular&${regularQuery}`,{waitUntil:'domcontentloaded',timeout:180000});await studentPage.locator('[data-report-root]').waitFor();
 for(const width of [390,768,1280]) {await studentPage.setViewportSize({width,height:960});await screenshot(studentPage,{path:path.join(evidence,`student-${width}.png`),fullPage:true});assert.ok(await studentPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await studentPage.getByRole('button',{name:'형사법',exact:true}).click();assert.ok((await studentPage.locator('[data-report-root] header').innerText()).includes('형사법'));assert.equal(await studentPage.locator('section[data-report-panel]:visible').count(),7);mark('student anchors, subject chips and 390/768/1280');
 const studentPrintPromise=studentPage.waitForEvent('popup');await studentPage.getByRole('button',{name:'선택 과목 학습 요약 인쇄',exact:true}).click();const studentPrint=await studentPrintPromise;await studentPrint.getByRole('button',{name:'인쇄 / PDF 저장',exact:true}).waitFor();assert.equal(await studentPrint.locator('.report-summary-table').count(),1);assert.ok((await studentPrint.locator('body').innerText()).includes('형사법'));await studentPrint.pdf({path:path.join(evidence,'student-summary.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});await studentPrint.close();mark('student summary prints the selected subject in a structured table');
 await studentContext.close();
 const fire=await browser.newContext({baseURL:info.baseUrl});await fire.request.post('/api/auth/login',{data:{email:manifest[1].adminEmail,password:'local-preview'}});
 const fireResponse=await fire.request.get(`/api/fire/exam-analysis-preview/regular?examTypeId=${manifest[1].regularTypeId}&studentId=${manifest[1].studentId}&examDate=${fixture.to}`);assert.equal(fireResponse.status(),200);const fireData=await fireResponse.json();assert.equal(fireData.easyThreshold,90);assert.equal(fireData.comparisons[0].fullScore,80);assert.equal(result.easyThreshold,70);assert.equal(result.comparisons[0].fullScore,100);await fire.close();mark('two academies retain independent points and thresholds');
 assert.deepEqual(failures,[]);mark('no browser runtime errors');
 fs.writeFileSync(path.join(evidence,'qa-results.json'),JSON.stringify({baseUrl:info.baseUrl,fixtureOnly:true,checks,failures},null,2));
} finally {await browser.close();}
