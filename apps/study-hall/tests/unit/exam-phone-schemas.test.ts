import assert from "node:assert/strict";
import test from "node:test";
import { examTypeSchema, examTypeReorderSchema, examScoresBatchSchema } from "../../lib/exam-schemas";
import { examScheduleSchema, examScheduleUpdateSchema } from "../../lib/exam-schedule-schemas";
import { morningExamScoresBatchSchema } from "../../lib/morning-exam-schemas";
import { scoreTargetUpsertSchema } from "../../lib/score-target-schemas";
import { phoneSubmissionStatusSchema, phoneSubmissionStatusInputSchema, phoneSubmissionBatchSchema, phoneBulkRentalSchema } from "../../lib/phone-submission-schemas";
import { rejectsAt } from "./schema-assertions";

const exam = { name: "정기시험", subjects: [{ name: "형사법" }] };
const scoreBatch = { examTypeId: "exam-a", examRound: 1, rows: [{ studentId: "student-a", scores: { constitution: 0, law: 37.5, police: null } }] };
const morning = { examTypeId: "exam-a", subjectId: "subject-a", date: "2026-09-08", rows: [{ studentId: "student-a", score: 0 }] };
const phone = { date: "2026-09-08", periodId: "period-a", records: [{ studentId: "student-a", status: "SUBMITTED" }] };

test("exam templates default to regular and accept fractional positive per-question scoring", () => {
  assert.equal(examTypeSchema.parse(exam).category, "REGULAR");
  assert.deepEqual(examTypeSchema.parse({ name: " 아침시험 ", category: "MORNING", studyTrack: null, subjects: [{ name: " 헌법 ", totalItems: 20, pointsPerItem: 2.5 }] }), { name: "아침시험", category: "MORNING", studyTrack: null, subjects: [{ name: "헌법", totalItems: 20, pointsPerItem: 2.5 }] });
  assert.equal(examTypeSchema.safeParse({ ...exam, subjects: [{ name: "과목", totalItems: null, pointsPerItem: null, isActive: false }] }).success, true);
});

test("exam templates need a subject, a valid category and positive question metadata", () => {
  for (const subjects of [[], null, undefined]) rejectsAt(examTypeSchema, { ...exam, subjects }, "subjects");
  rejectsAt(examTypeSchema, { ...exam, category: "OTHER" }, "category");
  rejectsAt(examTypeSchema, { ...exam, subjects: [{ name: " " }] }, "subjects.0.name");
  for (const totalItems of [0, -1, 1.5, "20"]) rejectsAt(examTypeSchema, { ...exam, subjects: [{ name: "과목", totalItems }] }, "subjects.0.totalItems");
  for (const pointsPerItem of [0, -1, "2", Infinity]) rejectsAt(examTypeSchema, { ...exam, subjects: [{ name: "과목", pointsPerItem }] }, "subjects.0.pointsPerItem");
});

test("exam reorder requires at least one nonempty identifier", () => {
  assert.deepEqual(examTypeReorderSchema.parse({ reorderIds: ["exam-b", "exam-a"] }), { reorderIds: ["exam-b", "exam-a"] });
  rejectsAt(examTypeReorderSchema, { reorderIds: [] }, "reorderIds");
  rejectsAt(examTypeReorderSchema, { reorderIds: ["exam-a", ""] }, "reorderIds.1");
});

test("regular scores preserve zero, decimal and missing-subject null values", () => {
  assert.deepEqual(examScoresBatchSchema.parse({ ...scoreBatch, examDate: null }), { ...scoreBatch, examDate: null });
  assert.equal(examScoresBatchSchema.safeParse({ ...scoreBatch, rows: [{ studentId: "student-a", scores: {} }] }).success, true);
  for (const score of ["0", undefined, NaN, Infinity]) rejectsAt(examScoresBatchSchema, { ...scoreBatch, rows: [{ studentId: "student-a", scores: { law: score } }] }, "rows.0.scores.law");
  for (const examRound of [0, -1, 1.5, "1", null]) rejectsAt(examScoresBatchSchema, { ...scoreBatch, examRound }, "examRound");
  rejectsAt(examScoresBatchSchema, { ...scoreBatch, examDate: "2026/09/08" }, "examDate");
  rejectsAt(examScoresBatchSchema, { ...scoreBatch, rows: [{ ...scoreBatch.rows[0], notes: "가".repeat(501) }] }, "rows.0.notes");
});

test("regular and morning score batches enforce 1–500 students", () => {
  for (const [schema, input, row] of [[examScoresBatchSchema, scoreBatch, scoreBatch.rows[0]], [morningExamScoresBatchSchema, morning, morning.rows[0]]] as const) {
    assert.equal(schema.safeParse({ ...input, rows: Array.from({ length: 500 }, (_, i) => ({ ...row, studentId: `student-${i}` })) }).success, true);
    for (const rows of [[], null, undefined, Array.from({ length: 501 }, (_, i) => ({ ...row, studentId: `student-${i}` }))]) rejectsAt(schema, { ...input, rows }, "rows");
    rejectsAt(schema, { ...input, rows: [{ ...row, studentId: "" }] }, "rows.0.studentId");
  }
});

test("morning scores require explicit null for missing scores and nonnegative integers otherwise", () => {
  for (const score of [null, 0, 100]) assert.equal(morningExamScoresBatchSchema.safeParse({ ...morning, rows: [{ studentId: "student-a", score, notes: null }] }).success, true);
  for (const score of [undefined, -1, 0.5, "0", NaN, Infinity]) rejectsAt(morningExamScoresBatchSchema, { ...morning, rows: [{ studentId: "student-a", score }] }, "rows.0.score");
  rejectsAt(morningExamScoresBatchSchema, { ...morning, subjectId: "" }, "subjectId");
  rejectsAt(morningExamScoresBatchSchema, { ...morning, date: null }, "date");
  rejectsAt(morningExamScoresBatchSchema, { ...morning, rows: [{ ...morning.rows[0], notes: "가".repeat(501) }] }, "rows.0.notes");
});

test("score targets accept zero, trim fields and reject invalid numeric or oversized input", () => {
  assert.deepEqual(scoreTargetUpsertSchema.parse({ examTypeId: " exam-a ", targetScore: 0, note: " 첫 목표 " }), { examTypeId: "exam-a", targetScore: 0, note: "첫 목표" });
  assert.equal(scoreTargetUpsertSchema.safeParse({ examTypeId: "exam-a", targetScore: 50, note: null }).success, true);
  for (const targetScore of [-1, 0.5, "50", null, Infinity]) rejectsAt(scoreTargetUpsertSchema, { examTypeId: "exam-a", targetScore }, "targetScore");
  rejectsAt(scoreTargetUpsertSchema, { examTypeId: " ", targetScore: 50 }, "examTypeId");
  rejectsAt(scoreTargetUpsertSchema, { examTypeId: "exam-a", targetScore: 50, note: "가".repeat(501) }, "note");
});

test("exam schedules accept each event type and defaults while updates permit partial fields", () => {
  for (const type of ["WRITTEN", "PHYSICAL", "INTERVIEW", "RESULT", "OTHER"]) assert.deepEqual(examScheduleSchema.parse({ name: "시험", type, examDate: "2026-09-08", description: null }), { name: "시험", type, examDate: "2026-09-08", description: null, isActive: true });
  assert.equal(examScheduleUpdateSchema.safeParse({}).success, true);
  assert.equal(examScheduleUpdateSchema.parse({ isActive: false }).isActive, false);
  assert.equal(examScheduleUpdateSchema.parse({ description: null }).description, null);
  const valid = { name: "시험", type: "WRITTEN", examDate: "2026-09-08" };
  rejectsAt(examScheduleSchema, { ...valid, name: "" }, "name");
  rejectsAt(examScheduleSchema, { ...valid, name: "가".repeat(101) }, "name");
  rejectsAt(examScheduleSchema, { ...valid, type: "MORNING" }, "type");
  rejectsAt(examScheduleSchema, { ...valid, examDate: "2026-9-8" }, "examDate");
  rejectsAt(examScheduleUpdateSchema, { description: "가".repeat(501) }, "description");
});

test("phone status distinguishes clearing from submitted, unsubmitted and rented", () => {
  for (const status of ["SUBMITTED", "NOT_SUBMITTED", "RENTED"]) {
    assert.equal(phoneSubmissionStatusSchema.parse(status), status);
    assert.equal(phoneSubmissionStatusInputSchema.parse(status), status);
  }
  assert.equal(phoneSubmissionStatusInputSchema.parse(null), null);
  assert.equal(phoneSubmissionStatusSchema.safeParse(null).success, false);
  for (const status of [undefined, "", "PRESENT", "submitted", 0]) assert.equal(phoneSubmissionStatusInputSchema.safeParse(status).success, false);
  assert.equal(phoneSubmissionBatchSchema.parse({ ...phone, records: [{ studentId: "student-a", status: null }] }).records[0].status, null);
});

test("phone batch bounds and nested identifiers/status are validated", () => {
  assert.equal(phoneSubmissionBatchSchema.parse({ ...phone, records: Array.from({ length: 500 }, (_, i) => ({ studentId: `student-${i}`, status: "SUBMITTED" })) }).records.length, 500);
  for (const records of [[], null, undefined, Array.from({ length: 501 }, () => phone.records[0])]) rejectsAt(phoneSubmissionBatchSchema, { ...phone, records }, "records");
  rejectsAt(phoneSubmissionBatchSchema, { ...phone, records: [{ status: "SUBMITTED" }] }, "records.0.studentId");
  rejectsAt(phoneSubmissionBatchSchema, { ...phone, records: [{ studentId: "student-a" }] }, "records.0.status");
  rejectsAt(phoneSubmissionBatchSchema, { ...phone, periodId: "" }, "periodId");
  rejectsAt(phoneSubmissionBatchSchema, { ...phone, date: "2026/09/08" }, "date");
});

test("phone loan approvals require an offset timestamp, place and purpose", () => {
  const approval = { until: "2026-09-08T12:00:00+09:00", place: " 상담실 ", purpose: " 면담 " };
  const withApproval = (loanApproval: unknown) => ({ ...phone, records: [{ studentId: "student-a", status: "RENTED", loanApproval }] });
  const parsed = phoneSubmissionBatchSchema.parse(withApproval(approval));
  assert.deepEqual(parsed.records[0].loanApproval, { ...approval, place: "상담실", purpose: "면담" });
  assert.equal(phoneSubmissionBatchSchema.safeParse(withApproval({ ...approval, until: "2026-09-08T03:00:00Z" })).success, true);
  for (const until of ["2026-09-08", "2026-09-08T12:00:00", "invalid", null]) rejectsAt(phoneSubmissionBatchSchema, withApproval({ ...approval, until }), "records.0.loanApproval.until");
  rejectsAt(phoneSubmissionBatchSchema, withApproval({ ...approval, place: " " }), "records.0.loanApproval.place");
  rejectsAt(phoneSubmissionBatchSchema, withApproval({ ...approval, place: "가".repeat(81) }), "records.0.loanApproval.place");
  rejectsAt(phoneSubmissionBatchSchema, withApproval({ ...approval, purpose: "가".repeat(201) }), "records.0.loanApproval.purpose");
});

test("bulk rental requires a bounded student selection and both periods", () => {
  const rental = { date: "2026-09-08", studentIds: ["student-a"], startPeriodId: "period-a", endPeriodId: "period-b" };
  assert.equal(phoneBulkRentalSchema.parse({ ...rental, overwriteExisting: false }).overwriteExisting, false);
  assert.equal(phoneBulkRentalSchema.safeParse({ ...rental, studentIds: Array.from({ length: 500 }, (_, i) => `student-${i}`) }).success, true);
  rejectsAt(phoneBulkRentalSchema, { ...rental, studentIds: [] }, "studentIds");
  rejectsAt(phoneBulkRentalSchema, { ...rental, studentIds: Array.from({ length: 501 }, (_, i) => `student-${i}`) }, "studentIds");
  for (const field of ["startPeriodId", "endPeriodId"] as const) rejectsAt(phoneBulkRentalSchema, { ...rental, [field]: "" }, field);
  rejectsAt(phoneBulkRentalSchema, { ...rental, rentalNote: "가".repeat(201) }, "rentalNote");
  rejectsAt(phoneBulkRentalSchema, { ...rental, overwriteExisting: "true" }, "overwriteExisting");
});
