import test from "node:test";
import assert from "node:assert/strict";
import { parseCumulativeAttendance } from "../../lib/cumulative-attendance-parser";
import { participationRows, selectedParticipation, type ParticipationStudent } from "../../lib/cumulative-attendance";
import { morningObjectiveFixture } from "../helpers/morning-objective-fixture";
import { buildExamPointAwards, parseExamPointAutomation, type ExamPointSource } from "../../lib/exam-point-automation";
import { buildVersionedExamPoints } from "../../lib/versioned-exam-points";
import { createAcademyPolicyDraft } from "../../lib/academy-policy-settings";

function file() {
  const fixture = morningObjectiveFixture();
  fixture.score[0][5] = "헌법/범죄학"; // No 객관식 column: cumulative format.
  fixture.score.slice(1).forEach(row => { row[5] = "SCORE_MUST_NOT_BE_USED"; row[6] = null; });
  fixture.errata[8].fill(null, 5); // Blank answers require review, not inferred absence.
  return fixture;
}
test("participation parser ignores scores, shifted keys and marks; reads every response block", () => {
  const fixture = file();
  for (const r of [1, 4, 7]) fixture.errata[r].fill("SHIFTED_KEY", 5);
  for (const r of [3, 6, 9]) fixture.errata[r].fill("IGNORED_MARK", 5);
  const files = fixture.files();
  const parsed = parseCumulativeAttendance(files.scoreBuffer, files.analysisBuffer);
  assert.deepEqual(parsed, { examDate: "2026-09-14", students: [
    { studentNumber: "90001", hasAnswer: true }, { studentNumber: "90002", hasAnswer: true }, { studentNumber: "90003", hasAnswer: false },
  ] });
  assert.ok(!/SCORE|PRIVATE|SHIFTED|MARK|1999/.test(JSON.stringify(parsed)));
  assert.equal(parseCumulativeAttendance(files.scoreBuffer).examDate, null);
  fixture.errata[8][25] = "1"; // Only a later cumulative subject has an answer, total score can be zero.
  assert.equal(parseCumulativeAttendance(fixture.files().scoreBuffer).students[2].hasAnswer, true);
});
test("duplicate identifiers, mismatched sheets and invalid answer blocks are rejected", () => {
  for (const mutate of [
    (f: ReturnType<typeof file>) => { f.score[2][0] = f.score[1][0]; },
    (f: ReturnType<typeof file>) => { f.errata[4][0] = "99999"; },
    (f: ReturnType<typeof file>) => { f.errata[2][5] = "unknown"; },
    (f: ReturnType<typeof file>) => { f.errata.pop(); },
  ]) { const fixture = file(); mutate(fixture); assert.throws(() => parseCumulativeAttendance(fixture.files().scoreBuffer)); }
  assert.throws(() => parseCumulativeAttendance(Buffer.from("<html>not Excel</html>")));
});
const student = (id: string, number: string): ParticipationStudent => ({ id, studentNumber: number, name: id, status: "ACTIVE", enrolledAt: "2026-08-01", seatId: "seat" });
test("preview scopes eligible roster, preserves approved states, and requires explicit decisions for missing/blank", () => {
  const parsed = parseCumulativeAttendance(file().files().scoreBuffer);
  const students = [student("a", "90001"), student("b", "90002"), student("c", "90003"), student("missing", "90004"),
    { ...student("new", "90005"), courseStartDate: "2026-10-01" }, { ...student("unseated", "90006"), seatId: null }];
  const preview = participationRows(parsed, students, [{ studentId: "b", date: "2026-09-14", periodId: "morning", status: "HOLIDAY", updatedAt: "x" }], "2026-09-14", "morning");
  assert.equal(preview.rows.length, 4);
  assert.equal(preview.rows[2].suggested, null); assert.equal(preview.rows[3].suggested, null);
  assert.throws(() => selectedParticipation(preview.rows, [{ studentId: "b", status: "PRESENT" }]));
  assert.throws(() => selectedParticipation(preview.rows, [{ studentId: "foreign", status: "PRESENT" }]));
  assert.throws(() => selectedParticipation(preview.rows, [{ studentId: "a", status: "ABSENT" }]));
  assert.deepEqual(selectedParticipation(preview.rows, [{ studentId: "c", status: "ABSENT" }]), [{ studentId: "c", status: "ABSENT", changed: true }]);
});
test("KST enrollment date does not include the previous UTC date", () => {
  const s = { ...student("a", "90001"), enrolledAt: "2026-09-17T15:30:00Z" };
  const source = { examDate: null, students: [{ studentNumber: "90001", hasAnswer: true }] };
  assert.equal(participationRows(source, [s], [], "2026-09-17", "morning").rows.length, 0);
  assert.equal(participationRows(source, [s], [], "2026-09-18", "morning").rows.length, 1);
});
test("attendance-only morning records affect absence and monthly attendance, never score ranks", () => {
  const config = parseExamPointAutomation({ enabled: true, effectiveFrom: "2026-08-31", morningStartDate: "2026-08-31", morningWeekdays: [1], morningAbsenceRuleId: "absence", morningFirstRuleId: "rank", morningMonthlyRuleId: "monthly" });
  const source: ExamPointSource = { morningPeriodId: "morning", students: [{ id: "a", status: "ACTIVE" }, { id: "b", status: "ACTIVE" }, { id: "unselected", status: "ACTIVE" }], sessions: [], participants: [],
    attendance: [{ studentId: "a", periodId: "morning", date: "2026-08-31", status: "PRESENT", reason: null }, { studentId: "b", periodId: "morning", date: "2026-08-31", status: "ABSENT", reason: null }], leave: [],
    rules: [{ id: "absence", points: -1, isActive: true }, { id: "rank", points: 5, isActive: true }, { id: "monthly", points: 3, isActive: true }] };
  const awards = () => buildExamPointAwards(config, source, "2026-08", "2026-09-18");
  assert.deepEqual(awards().map(a => [a.studentId, a.ruleId]), [["b", "absence"], ["a", "monthly"]]);
  source.sessions = [{ id: "s", examTypeId: "t", identityKey: "s", examDate: "2026-08-31", category: "MORNING", fullScore: 100 }];
  assert.equal(awards().filter(a => a.studentId === "a" && a.ruleId === "absence").length, 0);
  assert.equal(awards().filter(a => a.studentId === "b" && a.ruleId === "absence").length, 1);
  source.attendance[0].periodId = "afternoon";
  assert.equal(awards().some(a => a.studentId === "a" && a.ruleId === "absence"), true);
  source.attendance[1].status = "EXCUSED";
  assert.equal(awards().some(a => a.studentId === "b"), false);
  config.enabled = false; assert.deepEqual(awards(), []);
});
test("monthly attendance uses the morning period that applied on each exam day", () => {
  const config = parseExamPointAutomation({ enabled: true, effectiveFrom: "2026-08-01", morningStartDate: "2026-08-01", morningWeekdays: [1], morningMonthlyRuleId: "monthly" });
  const days = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"];
  const period = (day: string) => day < "2026-08-15" ? "before" : "after";
  const source: ExamPointSource = { morningPeriodId: "after", morningPeriodIdsByDate: new Map(days.map(day => [day, period(day)])),
    students: [{ id: "a", status: "ACTIVE" }], sessions: [], participants: [], leave: [],
    attendance: days.map(date => ({ studentId: "a", periodId: period(date), date, status: "PRESENT", reason: null })), rules: [{ id: "monthly", points: 3, isActive: true }] };
  assert.equal(buildExamPointAwards(config, source, "2026-08", "2026-09-18").length, 1);
  const periods = ["before", "after"].map(id => ({ id, name: id, startTime: "08:00", endTime: "08:30", isActive: true }));
  const managementPolicy = { ...createAcademyPolicyDraft("2026-08-01", periods), enabled: true,
    morningExam: { periodId: "before", weekdays: [1], syncAttendance: true } };
  const before = { settings: { managementPolicy, examPointAutomation: config }, periods, pointRules: source.rules, examTypes: [] };
  const after = { ...before, settings: { ...before.settings, managementPolicy: { ...managementPolicy, morningExam: { ...managementPolicy.morningExam, periodId: "after" } } } };
  const history = [{ status: "APPLIED", effectiveFrom: "2026-08-15", createdAt: "2026-08-14T00:00:00Z", before, after }];
  const { morningPeriodIdsByDate: _, ...register } = source;
  assert.equal(buildVersionedExamPoints(after, history, register, "2026-08", "2026-09-18").length, 1);
  after.settings.managementPolicy.enabled = false;
  assert.equal(buildVersionedExamPoints(after, [], register, "2026-08", "2026-09-18").length, 0);
});
