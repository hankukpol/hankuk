import assert from "node:assert/strict";
import test from "node:test";
import { readMockState } from "../../lib/mock-store";

const base = process.env.TEST_BASE_URL;
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base) || process.env.MOCK_MODE !== "true") throw new Error("Isolated local mock runtime required");
const cookieFrom = (response: Response) => response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
function assertPrivate(response: Response) {
  const directives = new Set(response.headers.get("cache-control")?.split(",").map(value => value.trim()));
  assert.ok(directives.has("private") && directives.has("no-store"));
  assert.ok(!directives.has("public"));
}
async function login(email: string) {
  const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({email,password:"fixture-password"}) });
  assert.equal(response.status,200); return cookieFrom(response);
}
test("regular analysis uses imported results, masks student reports and rejects IDOR", async () => {
  const admin = await login("admin-police@mock.local");
  const state = await readMockState();
  const [student,other] = state.studentsByDivision.police;
  const query = "examTypeId=import-http-regular&examDate=2026-08-15";
  const get = (path: string, cookie = admin) => fetch(`${base}/api/police/exams/analysis${path}`, {headers:{cookie}});
  const sessions = await get("/sessions?examTypeId=import-http-regular");
  assert.equal(sessions.status,200); assertPrivate(sessions);
  assert.equal((await sessions.json()).sessions.length,1);
  const response = await get(`?${query}`);
  assert.equal(response.status,200);
  const {analysis} = await response.json();
  assert.equal(analysis.session.fullScore,250); assert.equal(analysis.internal.count,5);
  assert.equal(analysis.internal.isReliable,false); assert.equal(analysis.ranking.length,5);
  assert.equal((await get("?examTypeId=import-http-regular&examDate=0")).status,400);
  assert.equal((await get("?examTypeId=missing&examDate=2026-08-15")).status,404);
  const studentLogin = await fetch(`${base}/api/auth/student-login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({division:"police",studentNumber:student.studentNumber,name:student.name})});
  assert.equal(studentLogin.status,200); const studentCookie=cookieFrom(studentLogin);
  const own=await get(`/student/${student.id}?${query}`,studentCookie);
  assert.equal(own.status,200); assertPrivate(own);
  const {report}=await own.json();
  assert.equal(report.student.name,null); assert.match(report.student.studentNumber,/^\d{2}\*+$/);
  for(const competitor of report.competitors) assert.match(competitor.studentNumber,/^\d{2}\*+$/);
  assert.equal(JSON.stringify(report).includes(other.name),false);
  assert.equal((await get(`/student/${other.id}?${query}`,studentCookie)).status,403);
  assert.equal((await get(`?${query}`,studentCookie)).status,401);
  const assistant=await login("assistant-police@mock.local");
  assert.equal((await get(`?${query}`,assistant)).status,403);
  assert.equal((await get(`/student/${student.id}?${query}`,assistant)).status,403);
});
