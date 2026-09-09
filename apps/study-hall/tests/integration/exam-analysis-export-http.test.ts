import assert from "node:assert/strict";
import test from "node:test";
import { Workbook } from "exceljs";
import { readMockState } from "../../lib/mock-store";

const base = process.env.TEST_BASE_URL;
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base) || process.env.MOCK_MODE !== "true") throw new Error("Isolated local mock runtime required");
const cookies = (r: Response) => r.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
async function login(email: string) {
  const r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "fixture-password" }) });
  assert.equal(r.status, 200); return cookies(r);
}

test("analysis exports are real three-sheet workbooks, administrator-only and private", async () => {
  const admin = await login("admin-police@mock.local");
  const state = await readMockState(), student = state.studentsByDivision.police[0];
  const get = (query: string, cookie = admin, division = "police") => fetch(`${base}/api/${division}/reports/exam-analysis?${query}`, { headers: { cookie } });
  const queries = ["kind=regular&examTypeId=import-http-regular&examDate=2026-08-15", "kind=morning&examTypeId=import-http-morning&from=2026-07-01&to=2026-09-08"];
  for (const query of queries) {
    const response = await get(query);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /spreadsheetml.sheet/);
    assert.match(response.headers.get("content-disposition") ?? "", /attachment;.*\.xlsx/);
    const cache = response.headers.get("cache-control") ?? "";
    assert.ok(cache.includes("private") && cache.includes("no-store") && !cache.includes("public"));
    const workbook = new Workbook(); await workbook.xlsx.load(await response.arrayBuffer());
    assert.equal(workbook.worksheets.length, 3);
    assert.ok(workbook.worksheets.every(sheet => sheet.rowCount >= 1 && sheet.getRow(1).cellCount > 0));
    assert.ok(JSON.stringify(workbook.worksheets[0].getSheetValues()).includes(student.name));
    if (query.includes("kind=regular")) assert.equal(workbook.worksheets[2].rowCount, 21);
  }
  assert.equal((await get("kind=morning&examTypeId=import-http-morning&from=2026-01-01&to=2026-09-08")).status, 400);
  assert.equal((await get("kind=unknown")).status, 400);
  assert.equal((await get(queries[0], "")).status, 401);
  assert.equal((await get(queries[0], admin, "fire")).status, 403);
  const assistant = await login("assistant-police@mock.local");
  assert.equal((await get(queries[0], assistant)).status, 403);
  const studentLogin = await fetch(`${base}/api/auth/student-login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ division: "police", studentNumber: student.studentNumber, name: student.name }) });
  assert.equal(studentLogin.status, 200);
  assert.equal((await get(queries[0], cookies(studentLogin))).status, 401);
});
