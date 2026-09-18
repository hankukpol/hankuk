import test from "node:test";
import assert from "node:assert/strict";
import { readMockState, updateMockState } from "../../lib/mock-store";
import { morningObjectiveFixture } from "../helpers/morning-objective-fixture";
import { createAcademyPolicyDraft } from "../../lib/academy-policy-settings";
import { parseExamPointAutomation } from "../../lib/exam-point-automation";
import type { ParticipationPreview } from "../../lib/cumulative-attendance";

const base = process.env.TEST_BASE_URL;
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base) || process.env.MOCK_MODE !== "true" || !process.env.MOCK_DB_DIR?.includes("runtime-"))
  throw new Error("A dedicated isolated mock runtime is required.");

test("attendance-only HTTP import preserves scores, protects leave, rejects stale/foreign requests and survives reload", async () => {
  const day = "2026-09-14";
  let periodId = "";
  const ids: string[] = [];
  await updateMockState(state => {
    const slug = "police", divisionId = state.divisions.find(d => d.slug === slug)!.id;
    const periods = state.periodsByDivision[slug]; periodId = periods[0].id;
    const policy = { ...createAcademyPolicyDraft(day, periods), enabled: true, morningExam: { periodId, weekdays: [1, 2, 3, 4, 5], syncAttendance: true } };
    Object.assign(state.divisionSettingsByDivision[slug], { managementPolicy: policy });
    state.divisionSettingsByDivision[slug].examPointAutomation = parseExamPointAutomation({ enabled: false, morningStartDate: day, morningWeekdays: [1, 2, 3, 4, 5] });
    state.academyApplications = state.academyApplications.filter(a => a.divisionId !== divisionId);
    state.studentsByDivision[slug].slice(0, 5).forEach((student, index) => {
      student.studentNumber = String(90001 + index); student.name = `출석검증${index + 1}`;
      student.status = "ACTIVE"; student.courseStartDate = "2026-08-01"; student.courseEndDate = null;
      student.seatId = state.seatsByDivision[slug][index].id;
      ids.push(student.id);
    });
    state.attendanceByDivision[slug] = state.attendanceByDivision[slug].filter(a => a.date !== day || a.periodId !== periodId);
    state.attendanceByDivision[slug].push({ id: "cumulative-protected", studentId: ids[1], periodId, date: day, status: "EXCUSED", reason: "승인된 사유", checkInTime: null, recordedById: null, createdAt: day, updatedAt: day });
  });
  const before = await readMockState();
  const scores = (state: typeof before) => JSON.stringify([state.examScoresByDivision, state.morningExamScoresByDivision, state.examSessionsByDivision, state.examSessionParticipantsByDivision, state.examSessionItemsByDivision, state.examItemResponsesByDivision]);
  const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin-police@mock.local", password: "fixture" }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  const fixture = morningObjectiveFixture(); fixture.score[0][5] = "헌법/범죄학"; fixture.errata[8].fill(null, 5);
  const files = fixture.files();
  async function call(mode: "preview" | "confirm", options: { slug?: string; cookie?: string; token?: string; selection?: unknown[]; date?: string; origin?: string } = {}) {
    const form = new FormData(); form.set("mode", mode);
    form.set("scoreFile", new Blob([new Uint8Array(files.scoreBuffer)]), "cumulative-score.xls");
    form.set("analysisFile", new Blob([new Uint8Array(files.analysisBuffer)]), "cumulative-moon.xls");
    if (options.date) form.set("date", options.date);
    if (options.token) form.set("token", options.token);
    if (options.selection) form.set("selection", JSON.stringify(options.selection));
    return fetch(`${base}/api/${options.slug ?? "police"}/attendance/cumulative-import`, { method: "POST", headers: { Cookie: options.cookie ?? cookie, ...(options.origin ? { Origin: options.origin } : {}) }, body: form });
  }
  assert.equal((await call("preview", { cookie: "" })).status, 401);
  assert.equal((await call("preview", { slug: "fire" })).status, 403);
  assert.equal((await call("preview", { origin: "https://foreign.example" })).status, 403);
  assert.equal((await call("preview", { date: "2026-09-18" })).status, 400);
  let response = await call("preview"); assert.equal(response.status, 200, await response.clone().text());
  let preview = (await response.json()).preview as ParticipationPreview;
  assert.equal(preview.rows.find(row => row.studentId === ids[1])?.protected, true);
  assert.equal(preview.rows.find(row => row.studentId === ids[2])?.suggested, null);
  assert.equal(preview.rows.find(row => row.studentId === ids[3])?.evidence, "MISSING");
  assert.equal(scores(await readMockState()), scores(before));
  assert.equal((await call("confirm", { token: preview.token, selection: [{ studentId: "foreign", status: "PRESENT" }] })).status, 400);
  assert.equal((await call("confirm", { token: preview.token, selection: [{ studentId: ids[1], status: "PRESENT" }] })).status, 400);
  await updateMockState(state => { state.attendanceByDivision.police.find(a => a.id === "cumulative-protected")!.updatedAt = new Date().toISOString(); });
  assert.equal((await call("confirm", { token: preview.token, selection: [{ studentId: ids[0], status: "PRESENT" }] })).status, 409);
  response = await call("preview"); preview = (await response.json()).preview;
  response = await call("confirm", { token: preview.token, selection: [{ studentId: ids[0], status: "PRESENT" }, { studentId: ids[2], status: "PRESENT" }, { studentId: ids[3], status: "ABSENT" }] });
  assert.equal(response.status, 200, await response.clone().text());
  const saved = (await response.json()).result;
  assert.equal(saved.applied, 3);
  assert.equal(saved.periodId, periodId, "The result link must point to the saved morning period");
  const after = await readMockState();
  assert.equal(scores(after), scores(before), "No scores, grading sessions, responses or item statistics may change");
  assert.deepEqual(after.attendanceByDivision.fire, before.attendanceByDivision.fire);
  const rows = after.attendanceByDivision.police.filter(a => a.periodId === periodId && a.date === day);
  assert.equal(rows.find(a => a.studentId === ids[0])?.status, "PRESENT");
  assert.equal(rows.find(a => a.studentId === ids[2])?.status, "PRESENT");
  assert.equal(rows.find(a => a.studentId === ids[3])?.status, "ABSENT");
  assert.equal(rows.find(a => a.studentId === ids[1])?.reason, "승인된 사유");
  assert.equal(rows.some(a => a.studentId === ids[4]), false, "Unselected missing students must remain untouched");
  assert.equal((await call("confirm", { token: preview.token, selection: [{ studentId: ids[0], status: "PRESENT" }] })).status, 409);
  response = await call("preview"); preview = (await response.json()).preview;
  assert.equal(preview.rows.find(a => a.studentId === ids[0])?.currentStatus, "PRESENT");
  assert.equal(preview.rows.find(a => a.studentId === ids[0])?.protected, true);
  console.log(JSON.stringify({ applied: 3, sourceDate: preview.date, gradesUnchanged: true, otherAcademyUnchanged: true, savedReloadVerified: true }));
});
