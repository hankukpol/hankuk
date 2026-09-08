import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const info = JSON.parse(fs.readFileSync(".local/policy-review/runtime.json", "utf8"));
assert.equal(info.fixtureOnly, true);
assert.match(info.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
assert.match(info.runtime.replaceAll("\\", "/"), /\/.local\/policy-[a-f0-9]{8}$/);
const state = () => JSON.parse(fs.readFileSync(path.join(info.runtime, ".local/mock-db.json"), "utf8"));
const results = [];
async function login(email) {
  const r = await fetch(info.baseUrl + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "fixture-password" }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map((s) => s.split(";")[0]).join("; ");
}
const admin = await login("admin-police@mock.local"), assistant = await login("assistant-police@mock.local");
async function request(url, body, cookie = admin, expected = 201) {
  const r = await fetch(info.baseUrl + url, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const data = await r.json();
  assert.equal(r.status, expected, `${url}: ${JSON.stringify(data)}`);
  return data;
}
const today = "2026-09-08", studentId = "student-police-001", periodId = "policy-period-2";
const phone = (record, cookie = assistant, expected = 201, date = today, period = periodId) => request("/api/police/phone-submissions", { date, periodId: period, records: [{ studentId, ...record }] }, cookie, expected);
const record = () => state().phoneSubmissionsByDivision.police.find((r) => r.studentId === studentId && r.periodId === periodId);
async function check(name, run) {
  try { await run(); results.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, pass: false, error: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
  fs.writeFileSync(".local/policy-review/phone-http-results.json", JSON.stringify(results, null, 2));
}
await check("조교는 오늘 출석만 기록, 벌점 직접 확정 불가", async () => {
  await request("/api/police/attendance", { date: today, periodId, records: [{ studentId, status: "PRESENT" }] }, assistant, 200);
  await request("/api/police/attendance", { date: "2026-09-07", periodId, records: [{ studentId, status: "PRESENT" }] }, assistant, 400);
  await request("/api/police/management-policy", { action: "confirm-attendance", date: today }, assistant, 403);
  assert.equal(state().pointRecordsByDivision.police.filter((r) => r.studentId === studentId && r.date.startsWith(today)).length, 0);
});
await check("단기 반출은 사유 필수, 10분 기한, 재저장 시 최초 반출시각 보존", async () => {
  await phone({ status: "RENTED", rentalNote: "" }, assistant, 400);
  await phone({ status: "RENTED", rentalNote: "본인인증" });
  const first = record().rentalNote;
  const start = new Date(first.match(/\[반출 ([^\]]+)\]/)[1]);
  const until = new Date(first.match(/반납기한 (\S+)/)[1]);
  assert.equal(until - start, 600000);
  await phone({ status: "RENTED", rentalNote: first });
  assert.equal(record().rentalNote, first);
});
await check("장기 예외 승인 권한, 기한·장소·목적 보존", async () => {
  const loanApproval = { until: new Date(Date.now() + 30 * 60000).toISOString(), place: "5층 지정공간", purpose: "본인인증 오류 처리" };
  await phone({ status: "RENTED", rentalNote: "승인 요청", loanApproval }, assistant, 400);
  await phone({ status: "RENTED", rentalNote: "승인 요청", loanApproval }, admin);
  assert.match(record().rentalNote, /\[승인 /);
  assert.match(record().rentalNote, /승인자 mock-admin-police/);
  assert.equal(Array.from(record().rentalNote.matchAll(/\[반출 /g)).length, 1);
});
await check("외출 인정 후에도 반납 기록 가능, 기존 반출 이력 보존", async () => {
  await request("/api/police/attendance", { date: today, periodId, records: [{ studentId, status: "EXCUSED", reason: "긴급 병원 외출 승인" }] }, assistant, 200);
  await phone({ status: "SUBMITTED" });
  assert.equal(record().status, "SUBMITTED");
  assert.match(record().rentalNote, /\[반납 /);
  assert.match(record().rentalNote, /\[반출 /);
  assert.equal(state().pointRecordsByDivision.police.filter((r) => r.studentId === studentId && r.date.startsWith(today)).length, 0);
});
await check("일요일·미신청5교시 제출 의무 제외, 일괄 장기대여 차단", async () => {
  await phone({ status: "NOT_SUBMITTED" }, admin, 400, "2026-09-06");
  await phone({ status: "NOT_SUBMITTED" }, admin, 400, today, "policy-period-6");
  await request("/api/police/phone-submissions/bulk-rental", { date: today, studentIds: [studentId], startPeriodId: periodId, endPeriodId: "policy-period-6", rentalNote: "인강" }, admin, 400);
});
await check("실패 입력과 반출·반납 이후 소방 데이터 불변", async () => {
  const after = JSON.stringify(Object.fromEntries(Object.entries(state()).filter(([key]) => key.endsWith("ByDivision")).map(([key, value]) => [key, value.fire])));
  assert.equal(after, fs.readFileSync(path.join(info.runtime, ".local/fire-before.json"), "utf8"));
});
console.log(JSON.stringify({ passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length }));
if (results.some((r) => !r.pass)) process.exitCode = 1;
