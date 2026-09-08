import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { readMockState } from "../../lib/mock-store";
import { applyMockPolicy, loadPolicyManifest } from "../restart-police-policy";

async function main() {
  assert.equal(process.env.MOCK_MODE, "true");
  assert.match(process.cwd().replaceAll("\\", "/"), /\/.local\/policy-[a-f0-9]{8}$/);
  const state = await readMockState();
  const manifest = await loadPolicyManifest();
  const fire = JSON.stringify(Object.fromEntries(Object.entries(state).filter(([key]) => key.endsWith("ByDivision")).map(([key, value]) => [key, (value as Record<string, unknown>).fire])));
  const now = new Date().toISOString();
  const divisionId = state.periodsByDivision.police[0].divisionId;
  state.periodsByDivision.police = manifest.periods.map((period: { startTime: string }, i: number) => ({ ...period, id: `policy-period-${i}`, divisionId, isActive: true, createdAt: now, updatedAt: now }));
  for (const key of ["attendanceByDivision", "pointRecordsByDivision", "phoneSubmissionsByDivision", "leavePermissionsByDivision", "studentSchedulesByDivision"] as const) {
    if (key in state) (state as unknown as Record<string, Record<string, unknown>>)[key].police = [];
  }
  applyMockPolicy(state, manifest);
  // Fixture only: allow completed days/months to exercise settlement and confirmation.
  const policy = (state.divisionSettingsByDivision.police as unknown as { managementPolicy: { effectiveFrom: string } }).managementPolicy;
  policy.effectiveFrom = "2026-08-01";
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(state).filter(([key]) => key.endsWith("ByDivision")).map(([key, value]) => [key, (value as Record<string, unknown>).fire]))), fire);
  await fs.writeFile(".local/mock-db.json", JSON.stringify(state, null, 2), "utf8");
  await fs.writeFile(".local/fire-before.json", fire, "utf8");
  console.log(JSON.stringify({ fixtureOnly: true, policyEffectiveFrom: policy.effectiveFrom, students: state.studentsByDivision.police.map((s) => ({ id: s.id, name: s.name, studentNumber: s.studentNumber })), periods: state.periodsByDivision.police.map((p) => ({ id: p.id, name: p.name, startTime: p.startTime, endTime: p.endTime })) }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
