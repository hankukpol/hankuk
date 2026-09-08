import assert from "node:assert/strict";
import test from "node:test";
import { announcementSchema } from "../../lib/announcement-schemas";
import { interviewSchema } from "../../lib/interview-schemas";
import { leavePermissionSchema, leaveSettlementSchema } from "../../lib/leave-schemas";
import { pointRuleSchema, pointCategoryCreateSchema, pointCategoryRenameSchema, pointCategoryDeleteSchema, pointRecordSchema, pointBatchSchema } from "../../lib/point-schemas";
import { studyRoomSchema, seatLayoutItemSchema, seatLayoutSaveItemSchema, seatLayoutSchema, seatAssignSchema } from "../../lib/seat-schemas";
import { rejectsAt } from "./schema-assertions";

test("announcements require trimmed content and an explicit allowed audience", () => {
  for (const scope of ["GLOBAL", "DIVISION"]) {
    assert.deepEqual(announcementSchema.parse({ title: " 공지 ", content: " 안내 내용 ", scope, publishedAt: null, isPinned: false, authorId: "injected" }), { title: "공지", content: "안내 내용", scope, publishedAt: null, isPinned: false });
  }
  const valid = { title: "공지", content: "내용", scope: "DIVISION" };
  for (const scope of [undefined, null, "ADMIN", ""]) rejectsAt(announcementSchema, { ...valid, scope }, "scope");
  for (const [field, limit] of [["title", 120], ["content", 3000]] as const) {
    for (const value of [" ", undefined, null, "가".repeat(limit + 1)]) rejectsAt(announcementSchema, { ...valid, [field]: value }, field);
    assert.equal(announcementSchema.safeParse({ ...valid, [field]: "가".repeat(limit) }).success, true);
  }
});

test("interview records require a reason and a recognized outcome", () => {
  const valid = { studentId: "student-a", date: "2026-09-08", reason: " 출결 상담 ", resultType: "INTERVIEW" };
  for (const resultType of ["WARNING_1", "WARNING_2", "INTERVIEW", "WITHDRAWAL"]) assert.equal(interviewSchema.parse({ ...valid, resultType, content: null, result: null }).reason, "출결 상담");
  for (const value of [null, "", " ", "가".repeat(301)]) rejectsAt(interviewSchema, { ...valid, reason: value }, "reason");
  rejectsAt(interviewSchema, { ...valid, resultType: "NORMAL" }, "resultType");
  rejectsAt(interviewSchema, { ...valid, date: "2026/09/08" }, "date");
  for (const [field, limit] of [["trigger", 200], ["content", 2000], ["result", 1000]] as const) {
    assert.equal(interviewSchema.safeParse({ ...valid, [field]: "가".repeat(limit) }).success, true);
    rejectsAt(interviewSchema, { ...valid, [field]: "가".repeat(limit + 1) }, field);
  }
});

test("leave input covers all leave types, nullable reasons and ignores injected approval", () => {
  for (const type of ["HOLIDAY", "HALF_DAY", "HEALTH", "OUTING"]) {
    const expected = { studentId: "student-a", date: "2026-09-08", type, reason: null };
    assert.deepEqual(leavePermissionSchema.parse({ ...expected, status: "APPROVED", approvedBy: "injected" }), expected);
  }
  const valid = { studentId: "student-a", date: "2026-09-08", type: "HOLIDAY" };
  rejectsAt(leavePermissionSchema, { ...valid, type: "HALF_HOLIDAY" }, "type");
  rejectsAt(leavePermissionSchema, { ...valid, studentId: "" }, "studentId");
  rejectsAt(leavePermissionSchema, { ...valid, reason: "가".repeat(501) }, "reason");
  assert.equal(leavePermissionSchema.parse({ ...valid, reason: "  " }).reason, "");
  assert.deepEqual(leaveSettlementSchema.parse({ month: "2026-09" }), { month: "2026-09" });
  for (const month of ["2026-9", "2026-09-08", null, ""]) rejectsAt(leaveSettlementSchema, { month }, "month");
});

test("point rules allow merit, penalty and zero with a custom category", () => {
  for (const points of [-7, 0, 13]) assert.deepEqual(pointRuleSchema.parse({ category: " 새 기준 ", name: " 시험 참여 ", points, description: null, isActive: false }), { category: "새 기준", name: "시험 참여", points, description: null, isActive: false });
  for (const points of [0.5, null, "1", NaN, Infinity]) rejectsAt(pointRuleSchema, { category: "출결", name: "지각", points }, "points");
  rejectsAt(pointRuleSchema, { category: "출결", name: " ", points: -1 }, "name");
});

test("point category CRUD uses trimmed nonempty bounded category names", () => {
  assert.deepEqual(pointCategoryCreateSchema.parse({ name: " 자습 " }), { name: "자습" });
  assert.deepEqual(pointCategoryRenameSchema.parse({ currentName: " 출결 ", nextName: " 출석 " }), { currentName: "출결", nextName: "출석" });
  assert.deepEqual(pointCategoryDeleteSchema.parse({ name: " 출석 " }), { name: "출석" });
  for (const name of ["", "  ", null, "가".repeat(31)]) {
    rejectsAt(pointCategoryCreateSchema, { name }, "name");
    rejectsAt(pointCategoryDeleteSchema, { name }, "name");
    rejectsAt(pointCategoryRenameSchema, { currentName: "출결", nextName: name }, "nextName");
  }
});

test("individual point grants require either a rule or an explicit numeric value, including zero", () => {
  for (const points of [-1, 0, 1]) assert.equal(pointRecordSchema.safeParse({ studentId: "student-a", points, date: null }).success, true);
  assert.equal(pointRecordSchema.safeParse({ studentId: "student-a", ruleId: "rule-a", points: null }).success, true);
  for (const points of [null, undefined]) rejectsAt(pointRecordSchema, { studentId: "student-a", ruleId: null, points }, "ruleId");
  rejectsAt(pointRecordSchema, { studentId: "student-a", points: "0" }, "points");
  rejectsAt(pointRecordSchema, { studentId: "student-a", points: 1, date: "2026-9-8" }, "date");
});

test("point batches enforce 1–500 students, an explicit date and a bounded request key", () => {
  const valid = { studentIds: ["student-a"], points: -2, date: "2026-09-08" };
  assert.equal(pointBatchSchema.parse(valid).points, -2);
  assert.equal(pointBatchSchema.parse({ ...valid, studentIds: Array.from({ length: 500 }, (_, i) => `student-${i}`) }).studentIds.length, 500);
  for (const studentIds of [[], null, undefined, Array.from({ length: 501 }, (_, i) => `student-${i}`)]) rejectsAt(pointBatchSchema, { ...valid, studentIds }, "studentIds");
  rejectsAt(pointBatchSchema, { ...valid, studentIds: [""] }, "studentIds.0");
  rejectsAt(pointBatchSchema, { ...valid, points: null }, "ruleId");
  for (const date of [null, undefined, ""]) rejectsAt(pointBatchSchema, { ...valid, date }, "date");
  for (const idempotencyKey of [" ", "a".repeat(101)]) rejectsAt(pointBatchSchema, { ...valid, idempotencyKey }, "idempotencyKey");
  assert.equal(pointBatchSchema.parse({ ...valid, idempotencyKey: " key " }).idempotencyKey, "key");
});

test("study room dimensions require integer bounds without numeric string coercion", () => {
  assert.deepEqual(studyRoomSchema.parse({ name: " 1실 ", columns: 3, rows: 2 }), { name: "1실", columns: 3, rows: 2 });
  assert.equal(studyRoomSchema.safeParse({ name: "대형실", columns: 20, rows: 20, aisleColumns: [], isActive: false }).success, true);
  for (const columns of [2, 21, 3.5, "9", null]) rejectsAt(studyRoomSchema, { name: "1실", columns, rows: 2 }, "columns");
  for (const rows of [1, 21, 2.5, "6", null]) rejectsAt(studyRoomSchema, { name: "1실", columns: 3, rows }, "rows");
  rejectsAt(studyRoomSchema, { name: "1실", columns: 3, rows: 2, aisleColumns: [0] }, "aisleColumns.0");
});

test("active seats need a label; inactive seats and assignments can be explicitly cleared", () => {
  const seat = { label: " A-01 ", positionX: 1, positionY: 1, isActive: true };
  assert.deepEqual(seatLayoutItemSchema.parse(seat), { ...seat, label: "A-01" });
  rejectsAt(seatLayoutItemSchema, { ...seat, label: "  " }, "label");
  assert.equal(seatLayoutItemSchema.parse({ ...seat, label: "  ", isActive: false }).label, "");
  assert.equal(seatLayoutSaveItemSchema.parse({ ...seat, assignedStudentId: null }).assignedStudentId, null);
  rejectsAt(seatLayoutSaveItemSchema, { ...seat, assignedStudentId: "" }, "assignedStudentId");
  for (const field of ["positionX", "positionY"] as const) {
    for (const value of [0, -1, 1.5, "1", null]) rejectsAt(seatLayoutItemSchema, { ...seat, [field]: value }, field);
  }
  assert.deepEqual(seatAssignSchema.parse({ studentId: null }), { studentId: null });
  assert.deepEqual(seatAssignSchema.parse({ studentId: "student-a" }), { studentId: "student-a" });
  for (const studentId of [undefined, ""]) rejectsAt(seatAssignSchema, { studentId }, "studentId");
});

test("seat layout saves require a room and allow an intentionally empty layout", () => {
  assert.deepEqual(seatLayoutSchema.parse({ roomId: "room-a", seats: [] }), { roomId: "room-a", seats: [] });
  rejectsAt(seatLayoutSchema, { roomId: "", seats: [] }, "roomId");
  rejectsAt(seatLayoutSchema, { roomId: "room-a", seats: null }, "seats");
  rejectsAt(seatLayoutSchema, { roomId: "room-a", seats: [{ label: "", positionX: 1, positionY: 1, isActive: true }] }, "seats.0.label");
});
