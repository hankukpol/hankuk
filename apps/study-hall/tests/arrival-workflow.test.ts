import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("arrival workflow: persistent mock, device scope, first receipt, corrections and scheduled settings", async (t) => {
  process.env.MOCK_MODE = "true";
  process.env.MOCK_DB_DIR = await mkdtemp(join(tmpdir(), "arrival-workflow-"));
  const store = await import("../lib/mock-store");
  const service = await import("../lib/services/arrival.service");
  const { DEFAULT_ARRIVAL_CONFIG } = await import("../lib/arrivals");
  const today = "2026-09-15";
  const now = new Date("2026-09-15T00:17:12.345Z");
  const actor = { id: "mock-admin-police", name: "테스트 담당자", role: "ADMIN" };
  await store.updateMockState((state) => {
    for (const slug of ["police", "fire"]) {
      const d = state.divisions.find((row) => row.slug === slug)!;
      const template = state.studentsByDivision[slug][0];
      state.studentsByDivision[slug] = [
        { ...template, id: `${slug}-s1`, divisionId: d.id, name: `${slug} 학생`, studentNumber: "00123", status: "ACTIVE", seatId: null },
        { ...template, id: `${slug}-s2`, divisionId: d.id, name: "휴원 학생", studentNumber: "00456", status: "ON_LEAVE", seatId: null },
        { ...template, id: `${slug}-s3`, divisionId: d.id, name: "퇴원 학생", studentNumber: "00789", status: "WITHDRAWN", seatId: null },
      ];
      state.divisionSettingsByDivision[slug].arrivalSettings = { revision: 0, versions: [] };
    }
  });
  const baseline = await store.readMockState();
  const unchanged = (state: typeof baseline) => JSON.stringify([state.attendanceByDivision, state.pointRecordsByDivision, state.examScoresByDivision, state.phoneSubmissionsByDivision]);
  let credential = "";
  let deviceId = "";
  await t.test("disabled tenant defaults, preview counts and stale config conflict", async () => {
    assert.equal((await service.getArrivalSettings("police")).current.enabled, false);
    const input = { expectedRevision: 0, config: { ...DEFAULT_ARRIVAL_CONFIG, enabled: true, effectiveDate: today } };
    const preview = await service.previewArrivalSettings("police", input, now);
    assert.equal(preview.eligibleCount, 2); assert.equal(preview.matchingCount, 2);
    await service.saveArrivalSettings("police", input, actor, now);
    await assert.rejects(service.saveArrivalSettings("police", input, actor, now), /다른 관리자/);
    assert.equal((await service.getArrivalSettings("fire")).current.enabled, false);
  });
  await t.test("one-time device approval, no plaintext credential in stored data or admin summary", async () => {
    const pairing = await service.startArrivalPairing("police", undefined, now);
    credential = pairing.token;
    assert.equal((await service.arrivalKioskStatus("police", undefined, credential, now)).status, "pending");
    await assert.rejects(service.approveArrivalDevice("fire", { code: pairing.code, name: "입구" }, actor, now));
    const result = await service.approveArrivalDevice("police", { code: pairing.code, name: "1층 입구" }, actor, now);
    deviceId = result.devices[0].id;
    assert.equal("credentialHash" in result.devices[0], false);
    assert.equal(JSON.stringify(await store.readMockState()).includes(credential), false);
    assert.equal((await service.arrivalKioskStatus("police", undefined, credential, now)).status, "ready");
    await assert.rejects(service.approveArrivalDevice("police", { code: pairing.code, name: "재등록" }, actor, now));
  });
  await t.test("concurrent and sequential repeats record only first time; next student accepted", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => service.recordArrival("police", credential, "00123", now)));
    assert.deepEqual(results[0], { ok: true, popupMs: 1200 });
    await service.recordArrival("police", credential, "00123", new Date(now.getTime() + 5000));
    await service.recordArrival("police", credential, "00456", new Date(now.getTime() + 6000));
    const day = await service.listArrivalDay("police", today, now);
    assert.equal(day.recordedCount, 2); assert.equal(day.missingCount, 0);
    assert.equal(day.rows.find((r) => r.studentNumber === "00123")?.record?.effectiveAt, now.toISOString());
    const month = await service.listArrivalMonth("police", "police-s1", "2026-09", true, now);
    assert.equal(month.history!.length, 1);
    assert.equal((await service.listArrivalMonth("police", "police-s1", "2026-09", false, now)).history, undefined);
  });
  await t.test("reject wrong length, invalid/ineligible student, unauthenticated and cross tenant requests", async () => {
    for (const number of ["123", "abcde", "99999", "00789"]) await assert.rejects(service.recordArrival("police", credential, number, now), /수험번호/);
    await assert.rejects(service.recordArrival("police", undefined, "00123", now));
    await assert.rejects(service.recordArrival("fire", credential, "00123", now));
    await assert.rejects(service.listArrivalMonth("fire", "police-s1", "2026-09", true, now));
    await assert.rejects(service.correctArrival("fire", { action: "ADD", studentId: "police-s1", date: today, time: "08:00", reason: "확인", expectedVersion: 0 }, actor, now));
  });
  await t.test("correction/cancel/recheck preserves snapshots and detects concurrent edit", async () => {
    const input = { action: "CORRECT" as const, studentId: "police-s1", date: today, time: "09:00:01", reason: "현장 확인", expectedVersion: 1 };
    await service.correctArrival("police", input, actor, now);
    await assert.rejects(service.correctArrival("police", input, actor, now), /다른 관리자/);
    await service.correctArrival("police", { ...input, action: "CANCEL", expectedVersion: 2, reason: "번호 오입력" }, actor, now);
    const later = new Date(now.getTime() + 10000);
    await service.recordArrival("police", credential, "00123", later);
    const month = await service.listArrivalMonth("police", "police-s1", "2026-09", true, now);
    assert.equal(month.records[0].firstReceivedAt, now.toISOString());
    assert.equal(month.records[0].effectiveAt, later.toISOString());
    assert.equal(month.records[0].version, 4);
    assert.equal(month.history!.length, 4);
    assert.ok(month.history!.find((h) => h.action === "CANCEL" && h.before?.source === "ADMIN_CORRECTED"));
  });
  await t.test("manual addition, historical date does not infer missing students", async () => {
    await service.correctArrival("police", { action: "ADD", studentId: "police-s1", date: "2026-09-14", time: "09:20", reason: "누락 확인", expectedVersion: 0 }, actor, now);
    const past = await service.listArrivalDay("police", "2026-09-14", now);
    assert.equal(past.rows.length, 1); assert.equal(past.missingCount, null);
    assert.equal(past.rows[0].record?.firstReceivedAt, null);
    assert.equal(past.rows[0].record?.source, "ADMIN_ADDED");
  });
  await t.test("future settings wait until KST effective date and leave previous records unchanged", async () => {
    await service.saveArrivalSettings("police", { expectedRevision: 1, config: { ...DEFAULT_ARRIVAL_CONFIG, enabled: false, effectiveDate: "2026-10-01", numberLength: 6 } }, actor, now);
    assert.equal((await service.arrivalKioskStatus("police", credential, undefined, now)).status, "ready");
    assert.equal((await service.arrivalKioskStatus("police", credential, undefined, new Date("2026-09-30T15:00:00Z"))).status, "disabled");
    assert.equal((await service.listArrivalDay("police", today, now)).recordedCount, 2);
    assert.equal(unchanged(await store.readMockState()), unchanged(baseline));
    assert.ok((await store.readMockState()).divisionSettingsHistoryByDivision.police.some((h) => h.section === "ARRIVALS"));
  });
  await t.test("expired pairing and credential, revoked device block new receipts", async () => {
    const pairing = await service.startArrivalPairing("police", undefined, now);
    await assert.rejects(service.approveArrivalDevice("police", { code: pairing.code, name: "만료" }, actor, new Date(now.getTime() + 600001)));
    await service.revokeArrivalDevice("police", deviceId, actor, now);
    await assert.rejects(service.recordArrival("police", credential, "00123", now));
    assert.equal((await service.arrivalKioskStatus("police", credential, undefined, now)).status, "expired");
    await assert.rejects(service.revokeArrivalDevice("fire", deviceId, actor, now));
  });
  await t.test("revoked device deletion hides only the own device and preserves receipt history", async () => {
    const before = await store.readMockState();
    await assert.rejects(service.deleteRevokedArrivalDevice("fire", deviceId, actor, now));
    await assert.rejects(service.deleteRevokedArrivalDevice("police", deviceId, {...actor,role:"ASSISTANT"}, now));
    const result = await service.deleteRevokedArrivalDevice("police", deviceId, actor, now);
    assert.ok(!result.devices.some(d=>d.id===deviceId));
    const after = await store.readMockState();
    assert.deepEqual(after.arrivalsByDivision,before.arrivalsByDivision);
    assert.deepEqual(after.arrivalHistoryByDivision,before.arrivalHistoryByDivision);
    const settings = await service.getArrivalSettings("police");
    const saved = await service.saveArrivalSettings("police", { expectedRevision: settings.revision, config: { ...DEFAULT_ARRIVAL_CONFIG, enabled: true, effectiveDate: today } }, actor, now);
    assert.ok(!saved.devices.some(d => d.id === deviceId), "settings save must not restore a deleted device");
    await assert.rejects(service.recordArrival("police",credential,"00123",now));
    const pair=await service.startArrivalPairing("police",undefined,now);
    const approved=await service.approveArrivalDevice("police",{code:pair.code,name:"활성 기기"},actor,now);
    await assert.rejects(service.deleteRevokedArrivalDevice("police",approved.devices[0].id,actor,now),/해제/);
  });
  await t.test("cancelled withdrawn students retain dated history without inflating missing count", async () => {
    await service.correctArrival("police", { action: "CANCEL", studentId: "police-s1", date: today, expectedVersion: 4, reason: "퇴원 전 오입력 확인" }, actor, now);
    await store.updateMockState(state => { state.studentsByDivision.police.find(s => s.id === "police-s1")!.status = "WITHDRAWN"; });
    const day = await service.listArrivalDay("police", today, now);
    assert.equal(day.rows.find(r => r.studentId === "police-s1")?.isEligible, false);
    assert.ok(day.rows.find(r => r.studentId === "police-s1")?.record?.cancelledAt);
    assert.equal(day.missingCount, 0);
    const past = await service.listArrivalDay("police", today, new Date("2026-09-16T00:00:00Z"));
    assert.equal(past.rows.length, day.rows.length);
  });
  await t.test("another enabled academy uses its own number length, popup and device lifetime", async () => {
    const fireActor = { ...actor, id: "mock-admin-fire", name: "다른 학원 담당자" };
    await store.updateMockState(state => { state.studentsByDivision.fire.find(s => s.id === "fire-s1")!.studentNumber = "000123"; });
    await service.saveArrivalSettings("fire", { expectedRevision: 0, config: { ...DEFAULT_ARRIVAL_CONFIG, enabled: true, effectiveDate: today, numberLength: 6, popupMs: 2000, deviceDays: 1 } }, fireActor, now);
    const pair = await service.startArrivalPairing("fire", undefined, now);
    const registered = await service.approveArrivalDevice("fire", { code: pair.code, name: "다른 학원 입구" }, fireActor, now);
    assert.equal(registered.devices[0].expiresAt, new Date(now.getTime() + 86400000).toISOString());
    await assert.rejects(service.recordArrival("fire", pair.token, "00123", now), /수험번호/);
    assert.deepEqual(await service.recordArrival("fire", pair.token, "000123", now), { ok: true, popupMs: 2000 });
    await assert.rejects(service.recordArrival("police", pair.token, "00123", now));
    assert.equal((await service.listArrivalDay("fire", today, now)).recordedCount, 1);
    const policeSettings = (await store.readMockState()).divisionSettingsByDivision.police.arrivalSettings!;
    assert.equal(policeSettings.versions[0].numberLength, 5);
    assert.equal(policeSettings.versions[0].popupMs, 1200);
  });
});
