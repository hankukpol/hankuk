import assert from "node:assert/strict";
import test from "node:test";
import { readMockState } from "../../lib/mock-store";
const base=process.env.TEST_BASE_URL;
if(!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base) || process.env.MOCK_MODE!=="true") throw new Error("Isolated local mock runtime required");
const cookies=(r:Response)=>r.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
async function login(email:string){const r=await fetch(base+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password:"fixture-password"})});assert.equal(r.status,200);return cookies(r);}
async function request(slug:string,cookie:string,action?:string,value?:unknown,id?:string){return fetch(`${base}/api/${slug}/settings/templates`,{method:action?"POST":"GET",headers:{cookie,"Content-Type":"application/json"},body:action?JSON.stringify({action,value,id}):undefined});}
test("existing settings and template APIs share independent configuration, preview, history and role protection",async()=>{
 const admin=await login("admin-fire@mock.local"), other=await login("admin-police@mock.local"), assistant=await login("assistant-police@mock.local");
 const read=await request("fire",admin);assert.equal(read.status,200);assert.match(read.headers.get("cache-control")??"",/no-store/);
 const library=await read.json();
 assert.equal((await request("fire",other)).status,403);
 assert.equal((await request("police",assistant)).status,403);
 const state=await readMockState(), student=state.studentsByDivision.fire[0];
 const loginStudent=await fetch(base+"/api/auth/student-login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({division:"fire",studentNumber:student.studentNumber,name:student.name})});
 assert.equal(loginStudent.status,200);assert.equal((await request("fire",cookies(loginStudent))).status,401);
 const broken=await fetch(base+"/api/fire/settings/templates",{method:"POST",headers:{cookie:admin,"Content-Type":"application/json"},body:"{"});assert.equal(broken.status,400);
 const before=await readMockState();const payload=structuredClone(library.current);payload.settings.tardyMinutes=library.current.settings.tardyMinutes===35?36:35;
 const value={name:"기존 설정 연동 검증",payload,effectiveFrom:library.earliestCalculationDate};
 const saved=await request("fire",admin,"save",{name:value.name,payload});assert.equal(saved.status,200);
 const preview=await request("fire",admin,"preview",value);assert.equal(preview.status,200,await preview.clone().text());const body=await preview.json();assert.ok(body.changes.some((r:{name:string})=>r.name==="tardyMinutes"));
 const applied=await request("fire",admin,"apply",{...value,revision:body.revision});assert.equal(applied.status,200,await applied.clone().text());const result=await applied.json();
 const settings=await fetch(base+"/api/fire/settings/rules",{headers:{cookie:admin}});assert.equal(settings.status,200);
 const actual=(await settings.json()).settings.tardyMinutes;assert.equal(actual,result.status==="APPLIED"?payload.settings.tardyMinutes:library.current.settings.tardyMinutes);
 assert.equal((await request("police",other,"history",undefined,result.id)).status,404);
 const history=await request("fire",admin,"history",undefined,result.id);assert.equal(history.status,200);
 assert.equal((await history.json()).before.settings.tardyMinutes,library.current.settings.tardyMinutes);
 if(result.status==="PENDING")assert.equal((await request("fire",admin,"cancel",undefined,result.id)).status,200);
 const after=await readMockState();for(const key of ["studentsByDivision","attendanceByDivision","pointRecordsByDivision","paymentRecordsByDivision","examScoresByDivision","morningExamScoresByDivision"] as const)assert.deepEqual(after[key],before[key]);
 assert.deepEqual(after.divisionSettingsByDivision.police,before.divisionSettingsByDivision.police);
 const hub = await fetch(base+"/fire/admin/settings",{headers:{cookie:admin},redirect:"manual"});
 if(hub.status===307) assert.equal(hub.headers.get("location"),"/fire/admin/settings/general");
 else { // App Router may already have streamed the layout when redirect() resolves.
   assert.equal(hub.status,200);
   assert.match(await hub.text(), /<meta[^>]*id="__next-page-redirect"[^>]*http-equiv="refresh"[^>]*content="1;url=\/fire\/admin\/settings\/general"/);
 }
 for(const [url,cookie] of [["/fire/admin/settings/general",admin],["/fire/admin/settings/rules?section=policy",admin],["/fire/student/attendance",cookies(loginStudent)],["/police/assistant/check",assistant],["/police/assistant/phones",assistant]]){const r:Response=await fetch(base+url,{headers:{cookie},redirect:"manual"});assert.equal(r.status,200,url);assert.doesNotMatch(await r.text(),/Application error: a server-side exception/);}
});
