import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
const info=JSON.parse(fs.readFileSync('.local/exam-preview/runtime.json','utf8'));
assert.equal(info.fixtureOnly,true);
const out='.superloopy/evidence/frontend/2026-09-17-exam-release';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({baseURL:info.baseUrl,viewport:{width:1280,height:1000}});
const page=await context.newPage();page.setDefaultTimeout(30000);
const errors=[],cases=[];page.on('pageerror',e=>errors.push(e.message));
const fixture=path.join(info.mockDir,'mock-db.json'),before=fs.readFileSync(fixture,'utf8');
try {
  const state=JSON.parse(before), original=state.examTypesByDivision.police[0];
  const archived={...original,id:'release-archived',name:'보관된 직접 입력 시험',isActive:false,subjects:original.subjects.map((s,i)=>({...s,id:`release-subject-${i}`,examTypeId:'release-archived'}))};
  state.examTypesByDivision.police.push(archived);
  state.examScoresByDivision.police.push({...state.examScoresByDivision.police[0],id:'release-manual',examTypeId:archived.id,studentId:'preview-police-s0',examDate:null,scores:Object.fromEntries(archived.subjects.map((s,i)=>[s.id,90-i*10])),totalScore:240,rankInClass:4,notes:'보존 검증'});
  fs.writeFileSync(fixture,JSON.stringify(state));
  assert.equal((await context.request.post('/api/auth/login',{data:{email:'admin-police@mock.local',password:'local-preview'}})).status(),200);
  const root='/police/admin/exams/students/preview-police-s0';
  const regular='?kind=regular&examTypeId=preview-police-monthly&examDate=2026-09-16';
  let api=await context.request.get('/api/police/exam-analysis/regular?studentId=preview-police-s0&examTypeId=preview-police-monthly&examDate=2026-09-16');
  assert.equal(api.status(),200,await api.text());const data=await api.json();assert.equal(data.isPreview,false);assert.equal(data.items.length,100);assert.equal(data.totalHistory.length,6);
  await page.goto(root+regular,{timeout:120000});await page.getByRole('table',{name:'과목별 학습 우선순위',exact:true}).waitFor();
  assert.equal(await page.getByText('로컬 테스트 데이터',{exact:true}).count(),0);
  for(const width of [390,768,1280]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`${out}/regular-${width}.png`});}
  cases.push('canonical administrator regular route, 100 items and six-month benchmark; three viewports');
  await page.goto(root+'?kind=morning&examTypeId=preview-police-morning&from=2026-09-01&to=2026-09-30');
  await page.getByRole('table',{name:'문항별 진도 비교',exact:true}).waitFor();await page.getByRole('tab',{name:'오답·문항 분석',exact:true}).click();
  await page.getByRole('table',{name:'복습 대상과 최근 결과',exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:/답안 미선택/}).count(),0);cases.push('canonical morning topics and review workflow');
  await page.goto('/police/admin/exams?tab=regular&view=analysis&examTypeId=preview-police-monthly&examDate=2026-09-16');
  await page.getByRole('heading',{name:`전체 ${data.examType.name} 분석`}).waitFor();
  await page.getByRole('link',{name:'개인 분석',exact:true}).first().waitFor();assert.ok(!(await page.getByRole('link',{name:'개인 분석',exact:true}).first().getAttribute('href')).includes('/preview/'));
  cases.push('existing admin analysis tab renders renewed cohort and canonical student links');
  await page.goto('/police/admin/exams/learning');await page.getByRole('table',{name:'표준 과목',exact:true}).waitFor();cases.push('production learning settings route');
  await page.goto(root+'?kind=regular&examTypeId=release-archived');await page.getByRole('table',{name:'입력 성적 기록',exact:true}).waitFor();
  assert.ok((await page.getByRole('table',{name:'입력 성적 기록',exact:true}).innerText()).includes('날짜 미등록'));assert.ok((await page.getByRole('table',{name:'입력 성적 기록',exact:true}).innerText()).includes('240점'));cases.push('inactive exam, undated manual marks, total/rank/notes retained');
  const student=await browser.newContext({baseURL:info.baseUrl,viewport:{width:390,height:844}});
  assert.equal((await student.request.post('/api/auth/student-login',{data:{division:'police',studentNumber:'98001',name:'테스트 김서준'}})).status(),200);
  const sp=await student.newPage();sp.on('pageerror',e=>errors.push(e.message));
  await sp.goto('/police/student/exams?analysisSession=preview-police-monthly:2026-09-16');await sp.getByRole('table',{name:'과목별 학습 우선순위',exact:true}).waitFor();await sp.screenshot({path:`${out}/student-mobile.png`});
  await sp.goto('/police/student/exams?morningType=preview-police-morning&morningFrom=2026-09-01&morningTo=2026-09-30');await sp.getByRole('table',{name:'문항별 진도 비교',exact:true}).waitFor();
  for(const endpoint of ['learning','regular']){
    const suffix=endpoint==='regular'?'&examTypeId=preview-police-monthly&examDate=2026-09-16':'';
    assert.equal((await student.request.get(`/api/police/exam-analysis/${endpoint}?studentId=preview-police-s1${suffix}`)).status(),403);
    assert.ok([401,403].includes((await context.request.get(`/api/fire/exam-analysis/${endpoint}?studentId=preview-fire-s0${suffix}`)).status()));
  }
  await student.close();cases.push('student canonical page, both legacy query formats and student/academy boundaries');
  assert.deepEqual(errors,[]);fs.writeFileSync(`${out}/browser.json`,JSON.stringify({cases,errors},null,2));console.log(JSON.stringify({passed:cases.length,errors}));
} catch(error){await page.screenshot({path:`${out}/failure.png`,fullPage:true});throw error;}
finally {fs.writeFileSync(fixture,before);await browser.close();}
