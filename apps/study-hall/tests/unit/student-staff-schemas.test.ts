import assert from "node:assert/strict";
import test from "node:test";
import { studentUpsertSchema, studentWithdrawSchema, studentMemoSchema, studentBulkCreateSchema } from "../../lib/student-schemas";
import { staffCreateSchema, staffUpdateSchema, staffPasswordResetSchema } from "../../lib/division-staff-schemas";
import { adminAccountCreateSchema, adminAccountUpdateSchema, adminPasswordResetSchema, divisionCreateSchema, divisionUpdateSchema } from "../../lib/super-admin-schemas";
import { rejectsAt } from "./schema-assertions";

const student = { name: "김학생", studentNumber: "00017" };
const staff = { name: "김조교", email: "assistant@example.test", password: "test-only-password", role: "ASSISTANT" };
const division = { name: "테스트 지점", fullName: "테스트 학원", color: "#1a2B3c" };

test("student creation trims text, preserves leading-zero numbers and strips injected authority", () => {
  assert.deepEqual(studentUpsertSchema.parse({ name: " 김학생 ", studentNumber: " 00017 ", role: "SUPER_ADMIN", divisionId: "another-division" }), student);
});

for (const field of ["name", "studentNumber"] as const) {
  test(`student ${field} rejects missing, null, blank and oversized text`, () => {
    for (const value of [undefined, null, "", " \n ", "가".repeat(51), 17]) {
      rejectsAt(studentUpsertSchema, { ...student, [field]: value }, field);
    }
    assert.equal(studentUpsertSchema.safeParse({ ...student, [field]: "가".repeat(50) }).success, true);
  });
}

test("student optional fields accept explicit clearing without inventing values", () => {
  const fields = { studyTrack: null, phone: null, seatId: null, courseStartDate: null, courseEndDate: null, tuitionPlanId: null, tuitionAmount: null, tuitionExemptReason: null, memo: null };
  assert.deepEqual(studentUpsertSchema.parse({ ...student, ...fields }), { ...student, ...fields });
  assert.deepEqual(studentMemoSchema.parse({ memo: "   " }), { memo: "" });
  assert.deepEqual(studentMemoSchema.parse({ memo: null }), { memo: null });
  rejectsAt(studentMemoSchema, {}, "memo");
  rejectsAt(studentMemoSchema, { memo: "가".repeat(2001) }, "memo");
});

test("tuition exemption requires a nonblank reason only while enabled", () => {
  for (const reason of [undefined, null, "", "  "]) {
    rejectsAt(studentUpsertSchema, { ...student, tuitionExempt: true, tuitionExemptReason: reason }, "tuitionExemptReason");
  }
  assert.equal(studentUpsertSchema.parse({ ...student, tuitionExempt: true, tuitionExemptReason: " 장학생 " }).tuitionExemptReason, "장학생");
  assert.equal(studentUpsertSchema.safeParse({ ...student, tuitionExempt: false }).success, true);
});

test("student tuition accepts free and maximum integer amounts but rejects coercion and nonfinite values", () => {
  for (const amount of [0, 1, 2_000_000_000]) assert.equal(studentUpsertSchema.safeParse({ ...student, tuitionAmount: amount }).success, true);
  for (const amount of [-1, 0.5, 2_000_000_001, "1000", NaN, Infinity]) rejectsAt(studentUpsertSchema, { ...student, tuitionAmount: amount }, "tuitionAmount");
});

test("normal student edits cannot perform withdrawal; withdrawal needs its own reason", () => {
  for (const status of ["ACTIVE", "ON_LEAVE", "GRADUATED"]) assert.equal(studentUpsertSchema.safeParse({ ...student, status }).success, true);
  for (const status of ["WITHDRAWN", "SUPER_ADMIN", null]) rejectsAt(studentUpsertSchema, { ...student, status }, "status");
  assert.deepEqual(studentWithdrawSchema.parse({ withdrawnNote: " 개인 사정 " }), { withdrawnNote: "개인 사정" });
  for (const withdrawnNote of [undefined, null, "  "]) rejectsAt(studentWithdrawSchema, { withdrawnNote }, "withdrawnNote");
});

test("student optional text enforces each published length limit", () => {
  for (const [field, limit] of [["studyTrack", 100], ["phone", 20], ["memo", 2000], ["tuitionExemptReason", 200]] as const) {
    assert.equal(studentUpsertSchema.safeParse({ ...student, [field]: "가".repeat(limit) }).success, true);
    rejectsAt(studentUpsertSchema, { ...student, [field]: "가".repeat(limit + 1) }, field);
  }
});

test("division staff creation/update accepts ADMIN and ASSISTANT, never SUPER_ADMIN", () => {
  for (const role of ["ADMIN", "ASSISTANT"]) {
    assert.equal(staffCreateSchema.parse({ ...staff, role }).isActive, true);
    assert.equal(staffUpdateSchema.parse({ name: staff.name, role, isActive: false }).isActive, false);
  }
  for (const role of ["SUPER_ADMIN", "STUDENT", "admin", null, undefined]) {
    rejectsAt(staffCreateSchema, { ...staff, role }, "role");
    rejectsAt(staffUpdateSchema, { name: staff.name, role }, "role");
  }
});

test("staff account input trims identity and discards externally supplied tenant assignment", () => {
  const parsed = staffCreateSchema.parse({ ...staff, email: " assistant@example.test ", name: " 김조교 ", divisionSlug: "elsewhere", id: "injected" });
  assert.deepEqual(parsed, { ...staff, isActive: true });
  for (const email of ["", "not-an-email", "a@", null]) rejectsAt(staffCreateSchema, { ...staff, email }, "email");
  rejectsAt(staffCreateSchema, { ...staff, name: "  " }, "name");
});

for (const [name, schema] of [["staff", staffPasswordResetSchema], ["super-admin", adminPasswordResetSchema]] as const) {
  test(`${name} password reset requires at least eight characters and preserves spaces`, () => {
    for (const password of [undefined, null, "", "1234567", 12345678]) rejectsAt(schema, { password }, "password");
    assert.deepEqual(schema.parse({ password: " 12345678 " }), { password: " 12345678 " });
    assert.equal(schema.safeParse({ password: "12345678" }).success, true);
  });
}

test("admin creation and update require a division for restricted roles", () => {
  for (const role of ["ADMIN", "ASSISTANT"]) {
    for (const divisionSlug of [undefined, null, "", "  "]) {
      rejectsAt(adminAccountCreateSchema, { ...staff, role, divisionSlug }, "divisionSlug");
      rejectsAt(adminAccountUpdateSchema, { name: staff.name, role, divisionSlug }, "divisionSlug");
    }
    assert.equal(adminAccountCreateSchema.parse({ ...staff, role, divisionSlug: " tenant-a " }).divisionSlug, "tenant-a");
  }
  assert.equal(adminAccountCreateSchema.safeParse({ ...staff, role: "SUPER_ADMIN", divisionSlug: null }).success, true);
  assert.equal(adminAccountUpdateSchema.safeParse({ name: staff.name, role: "SUPER_ADMIN" }).success, true);
  rejectsAt(adminAccountCreateSchema, { ...staff, role: "STUDENT" }, "role");
  rejectsAt(adminAccountCreateSchema, { ...staff, role: "SUPER_ADMIN", password: "short" }, "password");
});

test("division creation accepts runtime tenant slugs, hex colors and default ordering", () => {
  assert.deepEqual(divisionCreateSchema.parse({ ...division, slug: " branch-27 " }), { ...division, slug: "branch-27", displayOrder: 0, isActive: true });
  for (const slug of ["x", "UPPER", "경찰", "a/b", "a b", "a_b"]) rejectsAt(divisionCreateSchema, { ...division, slug }, "slug");
  for (const color of ["#fff", "blue", "#12345g", "123456"]) rejectsAt(divisionCreateSchema, { ...division, slug: "branch", color }, "color");
});

test("division updates preserve disabled state and do not change a slug", () => {
  assert.deepEqual(divisionUpdateSchema.parse({ ...division, isActive: false, displayOrder: 4, slug: "injected" }), { ...division, isActive: false, displayOrder: 4 });
  for (const displayOrder of [-1, 0.5, "1"]) rejectsAt(divisionUpdateSchema, { ...division, displayOrder }, "displayOrder");
});

test("student bulk creation trims rows, requires both fields and caps the batch size", () => {
  assert.deepEqual(
    studentBulkCreateSchema.parse({ rows: [{ studentNumber: " 20550 ", name: " 박성빈 " }] }),
    { rows: [{ studentNumber: "20550", name: "박성빈" }] },
  );
  rejectsAt(studentBulkCreateSchema, { rows: [] }, "rows");
  rejectsAt(studentBulkCreateSchema, { rows: [{ studentNumber: "20550", name: " " }] }, "rows.0.name");
  rejectsAt(studentBulkCreateSchema, { rows: [{ studentNumber: "", name: "박성빈" }] }, "rows.0.studentNumber");
  rejectsAt(
    studentBulkCreateSchema,
    { rows: Array.from({ length: 501 }, (_, i) => ({ studentNumber: String(i), name: "학생" })) },
    "rows",
  );
  assert.equal(
    studentBulkCreateSchema.safeParse({
      rows: Array.from({ length: 500 }, (_, i) => ({ studentNumber: String(i), name: "학생" })),
    }).success,
    true,
  );
});

test("student bulk creation carries an optional shared study track", () => {
  assert.deepEqual(
    studentBulkCreateSchema.parse({ studyTrack: " 경찰 ", rows: [{ studentNumber: "20550", name: "박성빈" }] }),
    { studyTrack: "경찰", rows: [{ studentNumber: "20550", name: "박성빈" }] },
  );
  assert.equal(studentBulkCreateSchema.parse({ studyTrack: null, rows: [{ studentNumber: "1", name: "가" }] }).studyTrack, null);
  rejectsAt(studentBulkCreateSchema, { studyTrack: "가".repeat(101), rows: [{ studentNumber: "1", name: "가" }] }, "studyTrack");
});
