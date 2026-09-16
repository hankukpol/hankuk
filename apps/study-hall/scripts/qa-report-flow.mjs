import {chromium} from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const info=JSON.parse(fs.readFileSync('.local/exam-preview/runtime.json'));
const out='.superloopy/evidence/frontend/2026-09-16-report-flow';
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({baseURL:info.baseUrl,viewport:{width:1280,height:1000}});
await context.request.post('/api/auth/login',{data:{email:'admin-police@mock.local',password:'local-preview'}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const base='/police/admin/exams/preview/students/preview-police-s0';
const cases=[];
const shot=async(name,locator)=>{await locator.scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/${name}.png`});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);};
const itemIds=async()=>page.locator('table[aria-label="문항별 상세 분석"]:visible tr[id*="-item-"]').evaluateAll(rows=>rows.map(row=>row.id.replace(/^(preview|subject)-item-/,'')));
const groups=(qs,threshold)=>[
 {name:'많이 맞힌 문제 중 내 오답',items:qs.filter(q=>q.correct===false&&q.answer?.trim()&&q.externalRate!==null&&q.externalRate>=threshold)},
 {name:'답을 비운 문항',items:qs.filter(q=>q.correct===false&&!q.answer?.trim())},
 {name:'그 밖의 내 오답',items:qs.filter(q=>q.correct===false&&q.answer?.trim()&&(q.externalRate===null||q.externalRate<threshold))},
];
try {
 await page.goto(`${base}?kind=morning&examTypeId=preview-police-morning&from=2026-09-08&to=2026-09-16`);
 await page.locator('#preview-main-results').waitFor();
 const data=await (await context.request.get('/api/police/exam-analysis-preview/morning?examTypeId=preview-police-morning&studentId=preview-police-s0&from=2026-09-08&to=2026-09-16')).json();
 for(const subject of data.subjects){
  await page.getByRole('tablist',{name:'분석 과목',exact:true}).getByRole('tab',{name:subject.name,exact:true}).click();
  const qs=data.items.filter(item=>item.subjectId===subject.id);
  for(const group of groups(qs,data.easyThreshold)){
   await page.locator('#preview-main-results').click();
   const row=page.getByRole('table',{name:'복습 우선순위'}).getByRole('rowgroup',{name:group.name,exact:true});
   const text=await row.innerText();for(const item of group.items){assert.ok(text.includes(item.date));assert.ok(text.includes(`${item.itemNo}번`));}
   if(!group.items.length)continue;
   await row.getByRole('button',{name:`${group.name} ${group.items.length}문항 전체 보기`,exact:true}).click();
   assert.equal(await page.locator('#preview-main-items').getAttribute('aria-selected'),'true');
   await page.waitForFunction(()=>document.querySelector('select[aria-label="문항 시험일"]')?.value==='all');
   assert.deepEqual((await itemIds()).sort(),group.items.map(item=>item.id).sort());
   cases.push(`morning ${subject.name}: ${group.name} ${group.items.length}`);
  }
 }
 await page.getByRole('tablist',{name:'분석 과목',exact:true}).getByRole('tab').first().click();
 for(const width of [390,768,1280,1874]){
  await page.setViewportSize({width,height:1000});
  await page.locator('#preview-main-results').click();await shot(`morning-summary-${width}`,page.getByRole('heading',{name:'기간 평균 비교',exact:true}));
  await shot(`morning-review-${width}`,page.getByRole('table',{name:'복습 우선순위'}));
  const row=page.getByRole('table',{name:'복습 우선순위'}).getByRole('rowgroup',{name:'많이 맞힌 문제 중 내 오답',exact:true});await row.getByRole('button').click();
  await shot(`morning-items-${width}`,page.locator('#preview-tabs-panel-items'));
  await page.locator('#preview-main-history').click();await shot(`morning-history-${width}`,page.getByRole('table',{name:'날짜별 진도와 복습'}));
 }
 // A day-specific jump must still work after an all-period group jump.
 const q=page.getByRole('table',{name:'날짜별 진도와 복습'}).getByRole('button',{name:/채점 결과/}).first();const qLabel=await q.getAttribute('aria-label');await q.click();
 await page.waitForFunction(()=>document.activeElement?.id.startsWith('preview-item-'));
 assert.equal(await page.getByLabel('문항 시험일',{exact:true}).inputValue(),qLabel.slice(0,10));
 await page.locator('#preview-item-filter-all').click();
 await page.waitForFunction(()=>document.querySelector('select[aria-label="문항 시험일"]')?.value==='all');
 const allIds=[];do{allIds.push(...await itemIds());const next=page.getByRole('navigation',{name:'문항 분석 페이지'}).getByRole('button',{name:'다음'});if(!await next.count()||await next.isDisabled())break;await next.click();}while(true);
 assert.equal(new Set(allIds).size,data.items.filter(i=>i.subjectId===data.subjects[0].id).length);
 assert.equal(await page.getByRole('tab',{name:/답안 미선택/}).count(),0);
 // Month selection and empty state remain honest.
 await page.getByLabel('아침 모의고사 조회 월').fill('2026-08');await page.locator('[aria-busy="false"] [data-report-root]').waitFor();
 await page.locator('#preview-main-results').click();await page.getByText('문항별 응답 자료가 없어 복습 문항을 계산할 수 없습니다.',{exact:true}).waitFor();
 await page.getByLabel('아침 모의고사 조회 월').fill('2026-09');await page.locator('[aria-busy="false"] [data-report-root]').waitFor();
 assert.equal(await page.getByLabel('시작일',{exact:true}).inputValue(),'2026-09-01');assert.equal(await page.getByLabel('종료일',{exact:true}).inputValue(),'2026-09-30');
 // All questions appear exactly once in print, regardless of the on-screen review filter.
 let event=page.waitForEvent('popup');await page.getByRole('button',{name:'선택 과목 A4 인쇄 / PDF 저장',exact:true}).click();let popup=await event;await popup.getByRole('button',{name:'인쇄 / PDF 저장',exact:true}).waitFor();
 const printed=await popup.locator('tr[id^="preview-item-"]').evaluateAll(rows=>rows.map(row=>row.id));assert.equal(new Set(printed).size,printed.length);assert.ok(printed.length>=60);await popup.pdf({path:`${out}/morning.pdf`,format:'A4'});await popup.close();

 await page.goto(`${base}?kind=regular&examTypeId=preview-police-regular&examDate=2026-09-16`);await page.locator('#regular-analysis-summary').waitFor();
 const regular=await (await context.request.get('/api/police/exam-analysis-preview/regular?examTypeId=preview-police-regular&studentId=preview-police-s0&examDate=2026-09-16')).json();
 for(const width of [390,768,1280,1874]){
  await page.setViewportSize({width,height:1000});await page.locator('#regular-analysis-summary').click();await shot(`regular-summary-${width}`,page.locator('#regular-summary'));
  await page.getByRole('button',{name:'헌법 오답 복습',exact:true}).click();assert.equal(await page.locator('#regular-analysis-subjects').getAttribute('aria-selected'),'true');await shot(`regular-subject-${width}`,page.locator('#regular-subjects'));
  await shot(`regular-review-${width}`,page.getByRole('table',{name:'복습 우선순위'}));
  await page.locator('#regular-analysis-peers').click();await shot(`regular-peers-${width}`,page.getByRole('table',{name:'익명 응시자 성적 비교'}));
 }
 await page.setViewportSize({width:1280,height:1000});await page.locator('#regular-analysis-subjects').click();
 for(const subject of regular.subjects){
  await page.getByRole('tablist',{name:'상세 분석 과목',exact:true}).getByRole('tab',{name:subject.name,exact:true}).click();
  const qs=regular.items.filter(item=>item.subjectId===subject.id);
  for(const group of groups(qs,regular.easyThreshold)){
   if(!group.items.length)continue;await page.getByRole('table',{name:'복습 우선순위'}).getByRole('button',{name:`${group.name} ${group.items.length}문항 전체 보기`,exact:true}).click();
   assert.deepEqual((await itemIds()).sort(),group.items.map(item=>item.id).sort());
   cases.push(`regular ${subject.name}: ${group.name} ${group.items.length}`);
  }
 }
 const last=regular.subjects.at(-1);await page.getByRole('button',{name:`${last.name} 최근 6개월 성적 변화 보기`,exact:true}).click();assert.equal(await page.locator(`#regular-history-subject-${last.id}`).getAttribute('aria-selected'),'true');
 await page.locator('#regular-analysis-peers').click();await page.getByRole('button',{name:/번째 .*성적 상세/}).first().click();await page.getByRole('dialog',{name:'응시자 성적 상세'}).waitFor();await page.keyboard.press('Escape');
 assert.equal(await page.getByRole('tab',{name:/답안 미선택/}).count(),0);
 event=page.waitForEvent('popup');await page.getByRole('button',{name:'전과목 A4 인쇄 / PDF 저장',exact:true}).click();popup=await event;await popup.getByRole('button',{name:'인쇄 / PDF 저장',exact:true}).waitFor();
 const printedRegular=await popup.locator('tr[id^="subject-item-"]').evaluateAll(rows=>rows.map(row=>row.id));assert.equal(printedRegular.length,60);assert.equal(new Set(printedRegular).size,60);await popup.pdf({path:`${out}/regular.pdf`,format:'A4'});await popup.close();

 await page.goto(`${base}?kind=morning&examTypeId=preview-police-morning&from=2026-09-14&to=2026-09-16`);
 await page.getByRole('tablist',{name:'분석 과목',exact:true}).getByRole('tab',{name:'경찰학',exact:true}).click();
 const missing=page.locator('[data-score-strip] p').filter({hasText:/^자료 없음$/});
 assert.equal(await missing.count(),4);assert.equal(await missing.first().evaluate(el=>getComputedStyle(el).fontSize),'13px');
 const filterLines=await page.locator('.admin-filter-bar').evaluate(el=>{const s=getComputedStyle(el);return ['Top','Right','Bottom','Left'].map(side=>({width:s[`border${side}Width`],color:s[`border${side}Color`]}));});
 assert.ok(filterLines.every(line=>line.width==='1px'&&line.color===filterLines[0].color));
 const underline=await page.getByRole('tablist',{name:'분석 과목',exact:true}).locator('[aria-selected="true"]').evaluate(el=>getComputedStyle(el).boxShadow);assert.ok(underline.includes('-1px'));
 await page.keyboard.press('ArrowLeft');assert.equal(await page.getByRole('tab',{name:'형사법',exact:true}).getAttribute('aria-selected'),'true');
 await page.getByRole('tab',{name:'경찰학',exact:true}).click();await shot('missing-score-1280',page.locator('#preview-tabs-panel-overview'));
 assert.deepEqual(errors,[]);
 fs.writeFileSync(`${out}/result.json`,JSON.stringify({status:'PASS',cases,widths:[390,768,1280,1874],errors},null,2));
 console.log('PASS: report flow, exact question groups, month/empty state, mobile, peers and print');
}finally{await browser.close();}
