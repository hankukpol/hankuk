import assert from "node:assert/strict";
import test from "node:test";
import { paymentSchema, paymentBatchSchema, enrollPaymentSchema, renewPaymentSchema, refundPaymentSchema } from "../../lib/payment-schemas";
import { tuitionPlanSchema } from "../../lib/tuition-schemas";
import { rejectsAt } from "./schema-assertions";

const entry = { paymentTypeId: "type-a", amount: 320000, paymentDate: "2026-09-08", method: "card" };
const payment = { ...entry, studentId: "student-a" };
const enrollment = { student: { name: "김학생", studentNumber: "00001" }, tuitionPlanId: "plan-a" };
const renewal = { studentId: "student-a", tuitionPlanId: "plan-a", idempotencyKey: "renewal-0001" };
const refund = { studentId: "student-a", refundPaymentTypeId: "refund-type", paymentDate: "2026-09-08" };

test("payment accepts signed nonzero integer amounts including both storage boundaries", () => {
  for (const amount of [-2_000_000_000, -1, 1, 2_000_000_000]) assert.equal(paymentSchema.parse({ ...payment, amount }).amount, amount);
  for (const amount of [0, -0, 0.1, -2_000_000_001, 2_000_000_001, "320000", null, NaN, Infinity]) rejectsAt(paymentSchema, { ...payment, amount }, "amount");
});

test("payment requires identifiers, a formatted date and a nonblank method", () => {
  for (const field of ["studentId", "paymentTypeId", "paymentDate", "method"] as const) {
    for (const value of [undefined, null, ""]) rejectsAt(paymentSchema, { ...payment, [field]: value }, field);
  }
  rejectsAt(paymentSchema, { ...payment, paymentDate: "2026-9-8" }, "paymentDate");
  rejectsAt(paymentSchema, { ...payment, method: " " }, "method");
  rejectsAt(paymentSchema, { ...payment, method: "가".repeat(51) }, "method");
  const parsed = paymentSchema.parse({ ...payment, method: " other:지역화폐 ", notes: " 현장 결제 " });
  assert.equal(parsed.method, "other:지역화폐");
  assert.equal(parsed.notes, "현장 결제");
  assert.equal(paymentSchema.parse({ ...payment, notes: null }).notes, null);
  rejectsAt(paymentSchema, { ...payment, notes: "가".repeat(501) }, "notes");
});

test("split payments accept one to ten entries and report the invalid nested entry", () => {
  assert.equal(paymentBatchSchema.parse({ studentId: "student-a", payments: [entry] }).payments.length, 1);
  assert.equal(paymentBatchSchema.parse({ studentId: "student-a", payments: Array.from({ length: 10 }, () => ({ ...entry })) }).payments.length, 10);
  for (const payments of [[], null, undefined, Array.from({ length: 11 }, () => entry)]) rejectsAt(paymentBatchSchema, { studentId: "student-a", payments }, "payments");
  rejectsAt(paymentBatchSchema, { studentId: "student-a", payments: [entry, { ...entry, amount: 0 }] }, "payments.1.amount");
});

test("paid enrollment accepts either the legacy single payment or split payment input", () => {
  assert.equal(enrollPaymentSchema.safeParse({ ...enrollment, payment: entry }).success, true);
  assert.equal(enrollPaymentSchema.safeParse({ ...enrollment, payments: [entry] }).success, true);
  rejectsAt(enrollPaymentSchema, enrollment, "payments");
  rejectsAt(enrollPaymentSchema, { ...enrollment, tuitionExempt: false }, "payments");
  rejectsAt(enrollPaymentSchema, { ...enrollment, payments: [] }, "payments");
});

test("exempt enrollment can omit payment only with a meaningful reason", () => {
  assert.equal(enrollPaymentSchema.parse({ ...enrollment, tuitionExempt: true, tuitionExemptReason: " 장학생 " }).tuitionExemptReason, "장학생");
  for (const tuitionExemptReason of [null, undefined, "", "  "]) rejectsAt(enrollPaymentSchema, { ...enrollment, tuitionExempt: true, tuitionExemptReason }, "tuitionExemptReason");
  rejectsAt(enrollPaymentSchema, { ...enrollment, tuitionExempt: true, tuitionExemptReason: "장학생", payment: { ...entry, amount: 0 } }, "payment.amount");
});

test("enrollment validates nested student identity, start-date shape and tuition override", () => {
  const base = { ...enrollment, payment: entry };
  rejectsAt(enrollPaymentSchema, { ...base, student: { ...enrollment.student, name: "  " } }, "student.name");
  rejectsAt(enrollPaymentSchema, { ...base, student: { ...enrollment.student, studentNumber: null } }, "student.studentNumber");
  rejectsAt(enrollPaymentSchema, { ...base, courseStartDate: "09/08/2026" }, "courseStartDate");
  for (const tuitionAmount of [null, 0, 2_000_000_000]) assert.equal(enrollPaymentSchema.safeParse({ ...base, tuitionAmount }).success, true);
  for (const tuitionAmount of [-1, 0.5, "100"]) rejectsAt(enrollPaymentSchema, { ...base, tuitionAmount }, "tuitionAmount");
});

test("renewal requires a bounded idempotency key while allowing service-resolved payment", () => {
  assert.equal(renewPaymentSchema.safeParse(renewal).success, true);
  assert.equal(renewPaymentSchema.parse({ ...renewal, idempotencyKey: " 12345678 ", payments: [entry] }).idempotencyKey, "12345678");
  for (const idempotencyKey of [undefined, null, "", "1234567", "a".repeat(101)]) rejectsAt(renewPaymentSchema, { ...renewal, idempotencyKey }, "idempotencyKey");
  assert.equal(renewPaymentSchema.safeParse({ ...renewal, idempotencyKey: "a".repeat(100), tuitionAmount: null }).success, true);
  rejectsAt(renewPaymentSchema, { ...renewal, payment: { ...entry, method: "" } }, "payment.method");
});

test("simple refunds take a positive magnitude and permit an omitted original payment", () => {
  const input = { ...refund, mode: "simple", amount: 1, method: "cash" };
  assert.equal(refundPaymentSchema.safeParse(input).success, true);
  assert.equal(refundPaymentSchema.safeParse({ ...input, originalPaymentId: null }).success, true);
  for (const amount of [0, -1, 0.5, 2_000_000_001, "1", null]) rejectsAt(refundPaymentSchema, { ...input, amount }, "amount");
  assert.equal(refundPaymentSchema.safeParse({ ...input, amount: 2_000_000_000 }).success, true);
  rejectsAt(refundPaymentSchema, { ...input, originalPaymentId: " " }, "originalPaymentId");
});

test("card cancellation uses its own required original payment and recharge fields", () => {
  const input = { ...refund, mode: "card-full-cancel", originalPaymentId: "payment-a", rechargePaymentTypeId: "type-a", rechargeAmount: 1 };
  assert.equal(refundPaymentSchema.safeParse(input).success, true);
  for (const field of ["originalPaymentId", "rechargePaymentTypeId", "rechargeAmount"] as const) rejectsAt(refundPaymentSchema, { ...input, [field]: undefined }, field);
  for (const rechargeAmount of [0, -1, 0.5, 2_000_000_001]) rejectsAt(refundPaymentSchema, { ...input, rechargeAmount }, "rechargeAmount");
  rejectsAt(refundPaymentSchema, { ...input, refundNotes: "가".repeat(501) }, "refundNotes");
  rejectsAt(refundPaymentSchema, { ...input, rechargeNotes: "가".repeat(501) }, "rechargeNotes");
  rejectsAt(refundPaymentSchema, { ...input, mode: "unknown" }, "mode");
});

test("tuition plans support free, disabled and open-ended plans", () => {
  assert.deepEqual(tuitionPlanSchema.parse({ name: " 장학 플랜 ", amount: 0, durationDays: null, description: " 안내 ", isActive: false }), { name: "장학 플랜", amount: 0, durationDays: null, description: "안내", isActive: false });
  assert.equal(tuitionPlanSchema.safeParse({ name: "기간 미정", amount: 1 }).success, true);
  assert.equal(tuitionPlanSchema.safeParse({ name: "하루권", amount: 1, durationDays: 1 }).success, true);
  for (const durationDays of [0, -1, 1.5, "14"]) rejectsAt(tuitionPlanSchema, { name: "플랜", amount: 1, durationDays }, "durationDays");
  for (const amount of [-1, 0.1, "100", null, Infinity]) rejectsAt(tuitionPlanSchema, { name: "플랜", amount }, "amount");
  rejectsAt(tuitionPlanSchema, { name: "  ", amount: 0 }, "name");
});
