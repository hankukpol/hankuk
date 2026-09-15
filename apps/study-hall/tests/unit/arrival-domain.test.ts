import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ARRIVAL_CONFIG, effectiveArrivalConfig, type ArrivalSettingsDocument } from "../../lib/arrivals";
import { applyArrivalCheckIn, applyArrivalCorrection } from "../../lib/arrival-domain";

const student = { id: "s1", divisionId: "d1", name: "테스트 학생", studentNumber: "00123", status: "ACTIVE" };
const device = { id: "k1", divisionId: "d1", name: "입구", credentialHash: "hash", registeredById: "a1", registeredByName: "담당자", createdAt: "2026-09-01T00:00:00Z", expiresAt: "2026-10-01T00:00:00Z", revokedAt: null };
const actor = { id: "a1", name: "담당자", role: "ADMIN" };
const first = new Date("2026-09-15T00:17:12.345Z");
test("first arrival survives retry and preserves leading zero identity", () => {
  const result = applyArrivalCheckIn(null, student, device, first);
  assert.equal(result.record.date, "2026-09-15");
  assert.equal(result.record.effectiveAt, first.toISOString());
  assert.equal(result.record.studentId, student.id);
  const retry = applyArrivalCheckIn(result.record, student, device, new Date("2026-09-15T04:00:00Z"));
  assert.deepEqual(retry.record, result.record);
  assert.equal(retry.history, null);
});
test("correction and cancellation keep original receipt and complete snapshots", () => {
  const original = applyArrivalCheckIn(null, student, device, first).record;
  const corrected = applyArrivalCorrection(original, student, { action: "CORRECT", studentId: student.id, date: original.date, expectedVersion: 1, time: "09:10:02", reason: "현장 확인" }, actor, new Date("2026-09-15T01:00:00Z"));
  assert.equal(corrected.record.firstReceivedAt, original.firstReceivedAt);
  assert.equal(corrected.record.effectiveAt, "2026-09-15T00:10:02.000Z");
  assert.equal(corrected.record.source, "ADMIN_CORRECTED");
  assert.deepEqual(corrected.history.before, original);
  const cancelled = applyArrivalCorrection(corrected.record, student, { action: "CANCEL", studentId: student.id, date: original.date, expectedVersion: 2, reason: "번호 오입력" }, actor, new Date("2026-09-15T02:00:00Z"));
  const recheck = applyArrivalCheckIn(cancelled.record, student, device, new Date("2026-09-15T03:00:00Z"));
  assert.equal(recheck.record.effectiveAt, "2026-09-15T03:00:00.000Z");
  assert.equal(recheck.record.firstReceivedAt, original.firstReceivedAt);
  assert.equal(recheck.history?.action, "RECHECK");
  assert.equal(recheck.record.version, 4);
});
test("wrong division/student, stale edits, absent reason and future time are rejected", () => {
  const original = applyArrivalCheckIn(null, student, device, first).record;
  const input = { action: "CORRECT" as const, studentId: student.id, date: original.date, expectedVersion: 1, time: "09:00", reason: "사유" };
  assert.throws(() => applyArrivalCorrection(original, student, { ...input, expectedVersion: 0 }, actor, first), /다른 관리자/);
  assert.throws(() => applyArrivalCorrection(original, student, { ...input, time: "10:00" }, actor, first), /미래/);
  assert.throws(() => applyArrivalCorrection(original, student, { ...input, reason: " " }, actor, first));
  assert.throws(() => applyArrivalCorrection(original, student, input, { ...actor, role: "ASSISTANT" }, first));
  assert.throws(() => applyArrivalCheckIn(original, { ...student, id: "s2" }, device, first));
  assert.throws(() => applyArrivalCheckIn(null, student, { ...device, divisionId: "d2" }, first));
});
test("KST midnight starts a new day and inactive students cannot check in", () => {
  assert.equal(applyArrivalCheckIn(null, student, device, new Date("2026-09-14T14:59:59Z")).record.date, "2026-09-14");
  assert.equal(applyArrivalCheckIn(null, student, device, new Date("2026-09-14T15:00:00Z")).record.date, "2026-09-15");
  for (const status of ["WITHDRAWN", "GRADUATED"]) assert.throws(() => applyArrivalCheckIn(null, { ...student, status }, device, first));
  assert.ok(applyArrivalCheckIn(null, { ...student, status: "ON_LEAVE" }, device, first));
});
test("disabled default and scheduled config use effective date rather than latest save", () => {
  const base = { ...DEFAULT_ARRIVAL_CONFIG, id: "v1", savedAt: first.toISOString(), savedById: actor.id, savedByName: actor.name };
  const document: ArrivalSettingsDocument = { revision: 2, versions: [{ ...base, enabled: true, effectiveDate: "2026-09-15" }, { ...base, id: "v2", enabled: false, effectiveDate: "2026-10-01" }] };
  assert.equal(effectiveArrivalConfig(document, "2026-09-14").enabled, false);
  assert.equal(effectiveArrivalConfig(document, "2026-09-15").enabled, true);
  assert.equal(effectiveArrivalConfig(document, "2026-10-01").enabled, false);
});
