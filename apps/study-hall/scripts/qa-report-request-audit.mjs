import {chromium} from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const info=JSON.parse(fs.readFileSync('.local/exam-preview/runtime.json','utf8'));
assert.equal(info.fixtureOnly,true);
const out='.superloopy/evidence/frontend/2026-09-16-request-audit';
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({baseURL:info.baseUrl,viewport:{width:1280,height:1000}});
await context.request.post('/api/auth/login',{data:{email:'admin-police@mock.local',password:'local-preview'}});
const page=await context.newPage(),errors=[],cases=[];
page.on('pageerror',error=>errors.push(error.message));
const base='/police/admin/exams/preview/students/preview-police-s0';
const morningQuery='examTypeId=preview-police-morning&studentId=preview-police-s0&from=2026-09-08&to=2026-09-16';
const regularQuery='examTypeId=preview-police-regular&studentId=preview-police-s0&examDate=2026-09-16';
const morning=await (await context.request.get(`/api/police/exam-analysis-preview/morning?${morningQuery}`)).json();
const regular=await (await context.request.get(`/api/police/exam-analysis-preview/regular?${regularQuery}`)).json();
const topFive=items=>Array.from(new Set(items.map(i=>i.sessionId))).flatMap(session=>items.filter(i=>i.sessionId===session&&i.externalRate!==null&&i.externalRate>=0&&i.externalRate<=100).sort((a,b)=>a.externalRate-b.externalRate||a.itemNo-b.itemNo).slice(0,5));
async function checkTopFive(items){
 const expected=topFive(items);
 const rows=await page.locator('[data-top5-item]').evaluateAll(rows=>rows.map(row=>({id:row.dataset.top5Item,cells:[...row.cells].map(cell=>cell.textContent)})));
 assert.deepEqual(rows.map(row=>row.id).sort(),expected.map(i=>i.id).sort());
 for(const row of rows){
  const item=expected.find(i=>i.id===row.id);
  assert.equal(row.cells[0],String(1+expected.filter(i=>i.sessionId===item.sessionId&&i.externalRate<item.externalRate).length));
  assert.equal(row.cells[1],String(item.itemNo));
  assert.equal(row.cells[2],`${Number((100-item.externalRate).toFixed(1))}%`);
  assert.equal(row.cells[4],item.correct===null?'기록 없음':item.correct?'정답':item.answer?.trim()?'오답':'답안 미선택');
 }
 assert.ok(rows.some(row=>row.cells[4]==='정답'));
}
async function screenshot(name,locator,width){
 await page.setViewportSize({width,height:1000});await locator.scrollIntoViewIfNeeded();
 await page.mouse.move(0,0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 if(name.startsWith('regular-history'))assert.equal(await locator.evaluate(table=>table.closest('.admin-table-frame').scrollWidth>table.closest('.admin-table-frame').clientWidth),false);
 if(name.startsWith('regular-history')){
  const chart=page.locator('#regular-history .recharts-surface').first();await chart.focus();await chart.press('ArrowRight');
  const tip=page.locator('#regular-history .recharts-tooltip-wrapper');
  const bounds=await tip.boundingBox();assert.ok(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width);
 }
 await page.screenshot({path:`${out}/${name}-${width}.png`});
}
async function checkPrint(items,filter){
 await page.locator(`#preview-item-filter-${filter}`).click();
 const event=page.waitForEvent('popup');await page.getByRole('button',{name:'선택 과목 A4 인쇄 / PDF 저장',exact:true}).click();
 const popup=await event;await popup.getByRole('button',{name:'인쇄 / PDF 저장',exact:true}).waitFor();
 assert.deepEqual((await popup.locator('tr[id^="preview-item-"]').evaluateAll(rows=>rows.map(row=>row.id.replace('preview-item-','')))).sort(),items.map(i=>i.id).sort());
 assert.ok((await popup.locator('body').innerText()).includes(`조회 기간 전체 ${items.length}문항 / 필터 조건에 맞는 문항 ${items.length}개`));
 await popup.close();assert.equal(await page.locator(`#preview-item-filter-${filter}`).getAttribute('aria-selected'),'true');
 cases.push(`morning print restores ${filter}; ${items.length} unique questions and matching explanation`);
}
try{
 await page.goto(`${base}?kind=morning&${morningQuery}`);await page.locator('#preview-main-results').waitFor();
 for(const subject of morning.subjects){
  await page.getByRole('tablist',{name:'분석 과목',exact:true}).getByRole('tab',{name:subject.name,exact:true}).click();
  await page.locator('#preview-main-items').click();await page.locator('#preview-item-filter-top5').click();
  await checkTopFive(morning.items.filter(i=>i.subjectId===subject.id));
  cases.push(`morning ${subject.name}: per-session TOP 5 and tied ranks match source`);
 }
 await page.getByRole('tablist',{name:'분석 과목',exact:true}).getByRole('tab').first().click();await page.locator('#preview-item-filter-top5').click();
 for(const width of [390,768,1280])await screenshot('morning-top5',page.locator('#preview-tabs-panel-items'),width);
 const qs=morning.items.filter(i=>i.subjectId===morning.subjects[0].id);
 await checkPrint(qs,'easy');await checkPrint(qs,'top5');
 assert.equal(await page.getByRole('tab',{name:/답안 미선택/}).count(),0);
 await page.getByLabel('아침 모의고사 조회 월').fill('2026-08');await page.locator('[aria-busy="false"] [data-report-root]').waitFor();await page.locator('#preview-main-items').click();await page.locator('#preview-item-filter-all').click();
 assert.equal(await page.locator('#preview-tabs-panel-items .admin-empty-state').count(),1);
 cases.push('empty item view shows one notice; no unanswered tab');

 // Missing comparison data must not mix all-attempt own mean with paired benchmark/gap.
 const sparse=structuredClone(morning),firstSubject=sparse.subjects[0].id;
 sparse.comparisons.find(row=>row.subjectId===firstSubject).external=null;
 await page.route('**/api/police/exam-analysis-preview/morning?*',route=>route.fulfill({json:sparse}));
 await page.goto(`${base}?kind=morning&${morningQuery}`);await page.getByRole('table',{name:'진도별 성적 비교'}).waitFor();
 const topicRows=await page.getByRole('table',{name:'진도별 성적 비교'}).locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent)));
 for(const cells of topicRows){
  const paired=sparse.comparisons.filter(row=>row.subjectId===firstSubject&&row.topic===cells[0]&&row.my!==null&&row.external!==null);
  const mean=key=>paired.reduce((sum,row)=>sum+row[key],0)/paired.length;
  assert.equal(cells[3],String(Number(mean('my').toFixed(1))));assert.equal(cells[4],String(Number(mean('external').toFixed(1))));
  assert.equal(cells[5],`${Number((mean('my')-mean('external')).toFixed(1))}점`);
 }
 await page.unroute('**/api/police/exam-analysis-preview/morning?*');
 cases.push('topic mean, benchmark and gap use identical paired exams when data is missing');

 await page.goto(`${base}?kind=regular&${regularQuery}`);await page.locator('#regular-analysis-subjects').click();
 for(const subject of regular.subjects){
  await page.getByRole('tablist',{name:'상세 분석 과목',exact:true}).getByRole('tab',{name:subject.name,exact:true}).click();
  await page.locator(`#subject-items-${subject.id}-top5`).click();await checkTopFive(regular.items.filter(i=>i.subjectId===subject.id));
  await page.getByRole('button',{name:`${subject.name} 최근 6개월 성적 변화 보기`,exact:true}).click();
  const table=page.getByRole('table',{name:'선택 과목 회차별 성적'});
  assert.ok((await table.locator('thead').innerText()).includes(`${subject.name} 점수 / 만점`));
  const displayed=await table.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent)));
  const expected=regular.comparisons.filter(row=>row.subjectId===subject.id);
  assert.equal(displayed.length,expected.length);
  for(let i=0;i<expected.length;i++){assert.equal(displayed[i][0],expected[i].date);assert.equal(displayed[i][1],`${expected[i].my} / ${expected[i].fullScore}`);assert.equal(displayed[i][2],String(Number(expected[i].external.toFixed(1))));}
  cases.push(`regular ${subject.name}: TOP 5 and subject-specific history values`);
  for(const width of [390,768,1280])await screenshot(`regular-history-${subject.name}`,table,width);
  await page.locator('#regular-analysis-subjects').click();
 }
 await page.setViewportSize({width:1280,height:1000});await page.locator('#regular-analysis-peers').click();
 const peerTable=page.getByRole('table',{name:'익명 응시자 성적 비교'});
 const peers=await peerTable.locator('tbody tr').evaluateAll(rows=>rows.map(row=>({rank:row.cells[0].textContent,score:row.cells[2].textContent,height:row.getBoundingClientRect().height,bg:getComputedStyle(row.cells[0]).backgroundColor,mine:row.textContent.includes('본인')})));
 assert.equal(new Set(peers.map(row=>row.height)).size,1);
 assert.ok(peers.some(row=>row.rank==='2위'));assert.ok(peers.filter(row=>row.rank==='2위').length>=2);
 for(const row of peers)for(const other of peers)if(row.score===other.score)assert.equal(row.rank,other.rank);
 assert.notEqual(peers.find(row=>row.mine).bg,peers.find(row=>!row.mine).bg);
 cases.push('peer ties share ranks; current row is highlighted; equal body row heights');
 assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/result.json`,JSON.stringify({status:'PASS',cases,errors,fixtureOnly:true},null,2));console.log(JSON.stringify({status:'PASS',cases,errors},null,2));
}catch(error){await page.screenshot({path:`${out}/failure.png`,fullPage:true});throw error;}finally{await browser.close();}
