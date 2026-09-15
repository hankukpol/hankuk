/** Local mock HTTP acceptance. Refuses any shared/production database or remote URL. */
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { readMockState, updateMockState } from "../lib/mock-store";
import { DEFAULT_ARRIVAL_CONFIG } from "../lib/arrivals";
import { getKstTodayYmd } from "../lib/date-utils";

async function main() {
  const base = process.env.ARRIVAL_QA_URL ?? "http://localhost:3000";
  assert.ok(process.env.MOCK_MODE === "true" && process.env.MOCK_DB_DIR?.includes("arrivals-qa") && ["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Only the isolated arrivals mock container is allowed");
  const today = getKstTodayYmd();
  const month = today.slice(0, 7);
  await updateMockState((state) => {
    for (const slug of ["police", "fire"]) {
      const division = state.divisions.find((d) => d.slug === slug)!;
      const template = state.studentsByDivision[slug][0];
      const people = [
        { id: `qa-arrival-${slug}-1`, name: "등원 확인 학생", studentNumber: "00123", status: "ACTIVE" as const },
        { id: `qa-arrival-${slug}-2`, name: "연속 입력 학생", studentNumber: "00456", status: "ON_LEAVE" as const },
        { id: `qa-arrival-${slug}-3`, name: "등원 기록 확인을 위한 긴 이름 학생", studentNumber: "00999", status: "ACTIVE" as const },
      ];
      state.studentsByDivision[slug] = [...state.studentsByDivision[slug].filter((s) => !people.some((p) => p.id === s.id || p.studentNumber === s.studentNumber)), ...people.map((p) => ({ ...template, ...p, divisionId: division.id, seatId: null }))];
      state.arrivalsByDivision[slug] = (state.arrivalsByDivision[slug] ?? []).filter((r) => !r.studentId.startsWith("qa-arrival-"));
      state.arrivalHistoryByDivision[slug] = (state.arrivalHistoryByDivision[slug] ?? []).filter((r) => !r.studentId.startsWith("qa-arrival-"));
    }
  });
  const baseline = await readMockState();
  const unaffected = (state: typeof baseline) => JSON.stringify([state.attendanceByDivision, state.pointRecordsByDivision, state.examScoresByDivision]);
  const evidence: { check: string; result: string }[] = [];
  type Jar = Map<string, string>;
  async function request(path: string, method = "GET", body?: unknown, jar: Jar = new Map(), origin = base) {
    const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json", Origin: origin, Cookie: Array.from(jar).map(([k, v]) => `${k}=${v}`).join("; ") }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    for (const cookie of response.headers.getSetCookie()) { const [part] = cookie.split(";"); const i = part.indexOf("="); jar.set(part.slice(0, i), part.slice(i + 1)); }
    const result = await response.json(); return { status: response.status, result, headers: response.headers };
  }
  async function check(name: string, run: () => Promise<void>) { await run(); evidence.push({ check: name, result: "PASS" }); console.log(`PASS ${name}`); }
  const admin = new Map(), assistant = new Map(), kiosk = new Map(), student = new Map();
  for (const [jar, email] of [[admin, "admin-police@mock.local"], [assistant, "assistant-police@mock.local"]] as [Jar, string][]) assert.equal((await request("/api/auth/login", "POST", { email, password: "local-qa" }, jar)).status, 200);
  await check("anonymous / assistant / other division blocked", async () => {
    assert.equal((await request("/api/police/arrivals")).status, 401);
    assert.equal((await request("/api/police/arrivals", "GET", undefined, assistant)).status, 403);
    assert.equal((await request("/api/fire/arrivals", "GET", undefined, admin)).status, 403);
  });
  await check("preview/save with revision and origin protection", async () => {
    const current = await request("/api/police/arrival-settings", "GET", undefined, admin);
    const input = { expectedRevision: current.result.revision, config: { ...DEFAULT_ARRIVAL_CONFIG, enabled: true, effectiveDate: today } };
    const p = await request("/api/police/arrival-settings/preview", "POST", input, admin); assert.equal(p.status, 200, JSON.stringify(p.result));
    assert.equal((await request("/api/police/arrival-settings", "PUT", input, admin, "https://foreign.invalid")).status, 403);
    assert.equal((await request("/api/police/arrival-settings", "PUT", input, admin)).status, 200);
    assert.equal((await request("/api/police/arrival-settings", "PUT", input, admin)).status, 409);
  });
  let deviceId = "";
  await check("pairing approval and credential privacy", async () => {
    const pair = await request("/api/police/arrival-kiosk/pair", "POST", undefined, kiosk);
    assert.equal(pair.status, 200); assert.equal("token" in pair.result, false);
    assert.ok(pair.headers.getSetCookie().some((v) => v.includes("HttpOnly") && v.includes("SameSite=strict")));
    const approved = await request("/api/police/arrival-settings/devices", "POST", { code: pair.result.code, name: "HTTP 확인 기기" }, admin);
    assert.equal(approved.status, 200); deviceId = approved.result.devices.find((d: { name: string }) => d.name === "HTTP 확인 기기").id;
    assert.equal(approved.result.devices.some((d: object) => "credentialHash" in d), false);
    const ready = await request("/api/police/arrival-kiosk", "GET", undefined, kiosk);
    assert.equal(ready.result.status, "ready"); assert.equal("credential" in ready.result, false);
    assert.ok(kiosk.get("study-hall-arrival-device"));
  });
  await check("parallel duplicates / next student / invalid number and privacy", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => request("/api/police/arrival-kiosk", "POST", { studentNumber: "00123" }, kiosk)));
    results.forEach((r) => { assert.equal(r.status, 200); assert.deepEqual(r.result, { ok: true, popupMs: 1200 }); });
    assert.equal((await request("/api/police/arrival-kiosk", "POST", { studentNumber: "00456" }, kiosk)).status, 200);
    assert.equal((await request("/api/police/arrival-kiosk", "POST", { studentNumber: "88888" }, kiosk)).status, 400);
    assert.equal((await request("/api/fire/arrival-kiosk", "POST", { studentNumber: "00123" }, kiosk)).status, 403);
  });
  await check("student sees own month and same instant, injected studentId is ignored", async () => {
    assert.equal((await request("/api/auth/student-login", "POST", { division: "police", name: "등원 확인 학생", studentNumber: "00123" }, student)).status, 200);
    const own = await request(`/api/police/student/arrivals?month=${month}&studentId=qa-arrival-police-2`, "GET", undefined, student);
    assert.equal(own.status, 200); assert.equal(own.result.student.id, "qa-arrival-police-1"); assert.equal("history" in own.result, false);
    const staff = await request(`/api/police/arrivals?month=${month}&studentId=qa-arrival-police-1`, "GET", undefined, admin);
    assert.equal(staff.result.records[0].effectiveAt, own.result.records[0].effectiveAt); assert.equal(staff.result.history.length, 1);
    assert.equal((await request("/api/fire/student/arrivals", "GET", undefined, student)).status, 401);
    assert.equal((await request("/api/police/arrival-settings", "GET", undefined, student)).status, 401);
  });
  await check("manual correction, stale conflict, cancel and recheck history", async () => {
    const body = { action: "CORRECT", studentId: "qa-arrival-police-1", date: today, expectedVersion: 1, time: "00:00:01", reason: "로컬 HTTP 정정 검증" };
    assert.equal((await request("/api/police/arrivals", "POST", body, admin)).status, 200);
    assert.equal((await request("/api/police/arrivals", "POST", body, admin)).status, 409);
    assert.equal((await request("/api/police/arrivals", "POST", { ...body, action: "CANCEL", expectedVersion: 2 }, admin)).status, 200);
    assert.equal((await request("/api/police/arrival-kiosk", "POST", { studentNumber: "00123" }, kiosk)).status, 200);
    const detail = await request(`/api/police/arrivals?month=${month}&studentId=qa-arrival-police-1`, "GET", undefined, admin);
    assert.equal(detail.result.history.length, 4); assert.equal(detail.result.records[0].version, 4);
  });
  await check("revocation blocks receipt, historical missing not invented, legacy data untouched", async () => {
    assert.equal((await request("/api/police/arrival-settings/devices", "DELETE", { deviceId }, admin)).status, 200);
    assert.equal((await request("/api/police/arrival-kiosk", "POST", { studentNumber: "00123" }, kiosk)).status, 403);
    const past = await request("/api/police/arrivals?date=2020-01-01", "GET", undefined, admin);
    assert.equal(past.result.missingCount, null);
    assert.equal(unaffected(await readMockState()), unaffected(baseline));
  });
  await check("student with arrival records is withdrawn on delete and history survives", async () => {
    const response = await request("/api/police/students/qa-arrival-police-2", "DELETE", undefined, admin);
    assert.equal(response.status, 200, JSON.stringify(response.result));
    assert.equal(response.result.mode, "WITHDRAWN");
    assert.ok(response.result.keptRecords.some((value: { label: string; count: number }) => value.label === "등원" && value.count > 0));
    const state = await readMockState();
    assert.ok(state.studentsByDivision.police.some(s => s.id === "qa-arrival-police-2"));
    assert.ok(state.arrivalsByDivision.police.some(r => r.studentId === "qa-arrival-police-2"));
    // Restore the isolated QA student for the following browser check.
    await updateMockState(s => { s.studentsByDivision.police.find(p => p.id === "qa-arrival-police-2")!.status = "ON_LEAVE"; });
  });
  await mkdir(".local", { recursive: true });
  await writeFile(".local/arrivals-http-qa.json", JSON.stringify({ testedAt: new Date().toISOString(), base, checks: evidence }, null, 2));
  console.log(`${evidence.length} HTTP acceptance groups passed`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
