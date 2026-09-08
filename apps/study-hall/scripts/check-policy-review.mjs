import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const info = JSON.parse(fs.readFileSync(".local/policy-review/runtime.json", "utf8"));
assert.equal(info.fixtureOnly, true);
assert.match(info.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
assert.match(info.runtime.replaceAll("\\", "/"), /\/.local\/policy-[a-f0-9]{8}$/);
const state = () => JSON.parse(fs.readFileSync(path.join(info.runtime, ".local/mock-db.json"), "utf8"));
const results = [];
let admin = "", assistant = "";
async function request(url, body, cookie = admin, expected = 200) {
  const response = await fetch(info.baseUrl + url, { method: body === undefined ? "GET" : "POST", headers: { cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual", signal: AbortSignal.timeout(45000) });
  const text = await response.text();
  assert.equal(response.status, expected, `${url}: ${text.slice(0, 700)}`);
  return text ? JSON.parse(text) : null;
}
async function login(email) {
  const r = await fetch(info.baseUrl + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "fixture-password" }) });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie().map((s) => s.split(";")[0]).join("; ");
}
async function check(name, run) {
  try { await run(); results.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, pass: false, error: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
  fs.writeFileSync(".local/policy-review/http-results.json", JSON.stringify(results, null, 2));
}
admin = await login("admin-police@mock.local");
assistant = await login("assistant-police@mock.local");
const s2 = "student-police-002", s3 = "student-police-003", s4 = "student-police-004";
const attendance = (date, periodId, records, cookie = admin) => request("/api/police/attendance", { date, periodId, records }, cookie);
const candidates = async (date) => (await request(`/api/police/management-policy?date=${date}`)).candidates;
const confirm = (date, cookie = admin, expected = 200) => request("/api/police/management-policy", { action: "confirm-attendance", date }, cookie, expected);

await check("8교시 시간표, 1~5교시 출결, 경찰 규칙 19개", async () => {
  const fixture = state();
  assert.equal(fixture.periodsByDivision.police.filter((p) => p.isActive).length, 8);
  assert.equal(fixture.periodsByDivision.police.at(-1).endTime, "21:50");
  assert.equal(fixture.pointRulesByDivision.police.filter((r) => r.isActive).length, 19);
  const snapshot = await request("/api/police/attendance?date=2026-09-07");
  assert.deepEqual(snapshot.periods.map((p) => p.name), ["1교시", "2교시", "3교시", "4교시", "5교시"]);
});
await check("지각 저장은 벌점 미확정, 관리자만 -2점 확정", async () => {
  await attendance("2026-09-07", "policy-period-2", [{ studentId: s2, status: "TARDY" }]);
  assert.equal(state().pointRecordsByDivision.police.filter((r) => r.studentId === s2 && r.date.startsWith("2026-09-07")).length, 0);
  assert.equal((await candidates("2026-09-07")).find((r) => r.studentId === s2).points, -2);
  await confirm("2026-09-07", assistant, 403);
  await confirm("2026-09-07");
  assert.equal(state().pointRecordsByDivision.police.find((r) => r.studentId === s2).points, -2);
});
await check("출결 재확정 중복 없음, 사유결석 정정 후 기존 자동벌점 해제", async () => {
  const before = state().pointRecordsByDivision.police;
  await confirm("2026-09-07");
  assert.deepEqual(state().pointRecordsByDivision.police, before);
  await attendance("2026-09-07", "policy-period-2", [{ studentId: s2, status: "EXCUSED", reason: "진료확인 인정" }]);
  await confirm("2026-09-07");
  assert.equal(state().pointRecordsByDivision.police.filter((r) => r.studentId === s2).length, 0);
});
await check("1~4교시 전체 결석은 관리일 -5점 단일 부과", async () => {
  for (const periodId of ["policy-period-2", "policy-period-3", "policy-period-4", "policy-period-5"]) await attendance("2026-09-07", periodId, [{ studentId: s3, status: "ABSENT" }]);
  assert.deepEqual((await candidates("2026-09-07")).filter((r) => r.studentId === s3).map((r) => r.points), [-5]);
  await confirm("2026-09-07");
  assert.deepEqual(state().pointRecordsByDivision.police.filter((r) => r.studentId === s3).map((r) => r.points), [-5]);
});
await check("일요일과 미신청 평일5교시, 토요일5교시 벌점 제외", async () => {
  await attendance("2026-09-06", "policy-period-2", [{ studentId: s2, status: "TARDY" }]);
  await attendance("2026-09-05", "policy-period-6", [{ studentId: s2, status: "TARDY" }]);
  await attendance("2026-09-07", "policy-period-6", [{ studentId: s2, status: "TARDY" }]);
  for (const date of ["2026-09-05", "2026-09-06", "2026-09-07"]) assert.equal((await candidates(date)).filter((r) => r.studentId === s2).length, 0);
});
await check("선택자습 신청 저장, 중복 차단, 오늘 보존하여 종료", async () => {
  const enrollment = { studentId: s2, periodId: "policy-period-6", dateFrom: "2026-09-08", dateTo: "2026-09-11", weekdays: [1, 2, 3, 4, 5] };
  await request("/api/police/management-policy", { action: "enroll", enrollment });
  await request("/api/police/management-policy", { action: "enroll", enrollment }, admin, 400);
  let saved = state().divisionSettingsByDivision.police.managementPolicy.optionalEnrollments.filter((e) => e.studentId === s2);
  assert.equal(saved.length, 1);
  await request("/api/police/management-policy", { action: "end-enrollment", enrollment: saved[0] });
  saved = state().divisionSettingsByDivision.police.managementPolicy.optionalEnrollments.filter((e) => e.studentId === s2);
  assert.equal(saved[0].dateTo, "2026-09-08");
});
await check("휴일권 전일신청, 월2회 제한, 당일 무사유 거절", async () => {
  for (const date of ["2026-09-14", "2026-09-15"]) await request("/api/police/leave", { studentId: s2, type: "HOLIDAY", date, reason: "사전 통보" }, admin, 201);
  await request("/api/police/leave", { studentId: s2, type: "HOLIDAY", date: "2026-09-16", reason: "세 번째 신청" }, admin, 400);
  await request("/api/police/leave", { studentId: s4, type: "HOLIDAY", date: "2026-09-08" }, admin, 400);
  const records = state().attendanceByDivision.police.filter((r) => r.studentId === s2 && r.date === "2026-09-14");
  assert.equal(records.length, 4);
  assert.ok(records.every((r) => r.status === "HOLIDAY"));
});
await check("휴일권 취소 시 연결 출석만 복구", async () => {
  const permission = state().leavePermissionsByDivision.police.find((r) => r.studentId === s2 && r.date.startsWith("2026-09-15"));
  await request(`/api/police/leave/${permission.id}/cancel`, {});
  assert.equal(state().attendanceByDivision.police.filter((r) => r.studentId === s2 && r.date === "2026-09-15").length, 0);
});
await check("증빙 있는 병가 반복 인정, 외출이 하루 전체출결을 지우지 않음", async () => {
  for (const date of ["2026-09-09", "2026-09-10"]) await request("/api/police/leave", { studentId: s4, type: "HEALTH", date, reason: "진료확인서 확인" }, admin, 201);
  const before = state().attendanceByDivision.police;
  await request("/api/police/leave", { studentId: s4, type: "OUTING", date: "2026-09-08", reason: "11:40 체력수업 사전승인" }, admin, 201);
  assert.deepEqual(state().attendanceByDivision.police, before);
});
await check("미사용 휴일권 정산 개당+2, 중복 정산 없음", async () => {
  await request("/api/police/leave/settle-month", { month: "2026-08" });
  const before = state().pointRecordsByDivision.police.filter((r) => r.date.startsWith("2026-08"));
  assert.ok(before.length > 0);
  assert.ok(before.every((r) => r.points === 4));
  await request("/api/police/leave/settle-month", { month: "2026-08" });
  assert.deepEqual(state().pointRecordsByDivision.police.filter((r) => r.date.startsWith("2026-08")), before);
});
await check("상점과 벌점 별도 집계, 이전달 기록 유지", async () => {
  await request("/api/police/points", { studentId: s4, points: 30, date: "2026-09-08", notes: "검증용 상점" }, admin, 201);
  await request("/api/police/points", { studentId: s4, points: -25, date: "2026-09-08", notes: "검증용 벌점" }, admin, 201);
  const result = await request("/api/police/points/overview");
  const student = result.students.find((s) => s.id === s4);
  assert.equal(student.meritPoints, 30);
  assert.equal(student.demeritPoints, 25);
  assert.equal(student.warningStage, "INTERVIEW");
  assert.ok(state().pointRecordsByDivision.police.some((r) => r.date.startsWith("2026-08")));
});
await check("경찰규정 적용 후 소방 설정과 운영 기록 전체 불변", async () => {
  const after = JSON.stringify(Object.fromEntries(Object.entries(state()).filter(([key]) => key.endsWith("ByDivision")).map(([key, value]) => [key, value.fire])));
  assert.equal(after, fs.readFileSync(path.join(info.runtime, ".local/fire-before.json"), "utf8"));
});
console.log(JSON.stringify({ passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length }));
if (results.some((r) => !r.pass)) process.exitCode = 1;
