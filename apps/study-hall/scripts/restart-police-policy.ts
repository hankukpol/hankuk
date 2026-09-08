/** Explicit, police-only rollout. Preview is the default; no student history is rewritten. */
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { managementPolicySchema } from "../lib/management-policy";
import { assertLocalRuntimeDoesNotUseRemoteDatabase } from "../lib/local-env-guard";

export async function loadPolicyManifest() {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), "docs/policies/restart-police-v3.1.json"), "utf8"));
}

export function mapPolicy(manifest: any, periods: { id: string; startTime: string }[]) {
  const id = (start: string) => {
    const found = periods.find((p) => p.startTime === start);
    if (!found) throw new Error(`교시 없음: ${start}`);
    return found.id;
  };
  const starts = ["09:15", "11:00", "13:45", "15:30", "18:15"];
  return managementPolicySchema.parse({ ...manifest.policy,
    attendancePeriodIds: starts.map(id),
    controlledPeriods: manifest.policy.controlledPeriods.map((p: any, i: number) => ({ ...p, periodId: id(starts[i]) })),
    morningExam: { ...manifest.policy.morningExam, periodId: id("08:30") },
  });
}

export function policySettings(manifest: any, periods: { id: string; startTime: string }[]) {
  return {
    managementPolicy: mapPolicy(manifest, periods),
    warnLevel1: 10, warnLevel2: 20, warnInterview: 25, warnWithdraw: 30,
    warnMsgLevel1: "관리주의", warnMsgLevel2: "정식 면담·7일 개선미션", warnMsgInterview: "최종경고·개선확약", warnMsgWithdraw: "이용종료 검토",
    tardyMinutes: 0, holidayLimit: 2, holidayUnusedPts: 2, halfDayLimit: 0, halfDayUnusedPts: 0,
    perfectAttendancePtsEnabled: false, perfectAttendancePts: 0,
    tardyPointRuleId: manifest.policy.tardyRuleId, absentPointRuleId: null,
    operatingDays: { mon: true, tue: true, wed: true, thu: true, fri: true, sat: true, sun: false },
    pointCategories: Array.from(new Set(manifest.rules.map((r: any) => r.category))),
  };
}

export function applyMockPolicy(state: any, manifest: any) {
  const slug = "police";
  const old = state.periodsByDivision[slug];
  const divisionId = old[0].divisionId;
  const now = new Date().toISOString();
  const periods = manifest.periods.map((p: any) => ({ ...(old.find((o: any) => o.startTime === p.startTime) ?? { id: randomUUID(), divisionId, createdAt: now }), ...p, isActive: true, updatedAt: now }));
  if (old.some((p: any) => !manifest.periods.some((n: any) => n.startTime === p.startTime))) throw new Error("예상하지 못한 교시가 있어 적용을 중단했습니다.");
  state.periodsByDivision[slug] = periods;
  const oldRules = state.pointRulesByDivision[slug] ?? [];
  state.pointRulesByDivision[slug] = [...oldRules.filter((r: any) => !manifest.rules.some((n: any) => n.id === r.id)).map((r: any) => ({ ...r, isActive: false })),
    ...manifest.rules.map(({ key, ...r }: any) => ({ ...r, divisionId, isActive: true, createdAt: now }))];
  state.divisionSettingsByDivision[slug] = { ...state.divisionSettingsByDivision[slug], ...policySettings(manifest, periods) };
  return state;
}

async function main() {
  const manifest = await loadPolicyManifest();
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const choice = args.find((a) => a.startsWith("--conflicts="))?.split("=")[1] ?? (manifest.decision?.basis === "student_penalty_table" ? "table" : undefined);
  if (apply && choice !== "table" && choice !== "body") throw new Error("문서 내부 충돌에 대한 운영자 결정이 필요합니다: --conflicts=table 또는 --conflicts=body");
  if (choice) {
    const rule = manifest.rules.find((r: any) => r.key === "regular-absence");
    rule.points = choice === "body" ? -2 : -3;
    rule.description = `의무 참여·OMR 제출. 운영자 확인: 학생규정집 ${choice === "body" ? "본문" : "벌점표"} 기준.`;
  }
  if (!apply) {
    process.stdout.write(JSON.stringify({ scope: "police", apply: false, requiresConflictDecision: !choice, periods: manifest.periods, rules: manifest.rules, settings: policySettings(manifest, manifest.periods.map((p: any) => ({ ...p, id: p.startTime }))) }, null, 2));
    return;
  }
  const localRequire = createRequire(path.join(process.cwd(), "package.json"));
  const nextRequire = createRequire(localRequire.resolve("next/package.json"));
  const { loadEnvConfig } = nextRequire("@next/env"); loadEnvConfig(process.cwd());
  if (process.env.MOCK_MODE === "true") throw new Error("운영 적용 명령은 MOCK_MODE=false 환경에서만 실행합니다. 테스트 데이터에는 applyMockPolicy를 사용하세요.");
  assertLocalRuntimeDoesNotUseRemoteDatabase(process.env.DATABASE_URL);
  if (!process.env.DATABASE_URL || new URL(process.env.DATABASE_URL).searchParams.get("schema") !== "study_hall") throw new Error("DATABASE_URL의 schema=study_hall을 확인해 주세요. 다른 앱의 DB에는 적용하지 않습니다.");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const column = await prisma.$queryRaw<any[]>`SELECT 1 FROM information_schema.columns WHERE table_schema='study_hall' AND table_name='division_settings' AND column_name='management_policy'`;
    if (!column.length) throw new Error("management_policy 스키마 마이그레이션을 먼저 배포하세요.");
    const before = await prisma.$queryRaw<any[]>`SELECT jsonb_build_object('settings', (SELECT jsonb_agg(s) FROM study_hall.division_settings s), 'periods', (SELECT jsonb_agg(p) FROM study_hall.periods p), 'rules', (SELECT jsonb_agg(r) FROM study_hall.point_rules r)) AS snapshot`;
    const backupPath = path.join(process.cwd(), ".local", `restart-policy-before-${Date.now()}.json`);
    await fs.mkdir(path.dirname(backupPath), { recursive: true }); await fs.writeFile(backupPath, JSON.stringify(before, null, 2), "utf8");
    const result = await prisma.$transaction(async (tx) => {
      const division = await tx.division.findUniqueOrThrow({ where: { slug: "police" } });
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('restart-policy:police'))`;
      const current = await tx.$queryRaw<any[]>`SELECT management_policy FROM study_hall.division_settings WHERE division_id=${division.id} FOR UPDATE`;
      if (current[0]?.management_policy) throw new Error("이미 관리규정이 적용되었습니다. 기존 신청·운영설정을 덮어쓰지 않습니다.");
      const old = await tx.period.findMany({ where: { divisionId: division.id } });
      if (old.some((p) => !manifest.periods.some((n: any) => n.startTime === p.startTime)) || new Set(old.map((p) => p.startTime)).size !== old.length) throw new Error("시간표가 예상과 다릅니다. 다시 비교해 주세요.");
      for (const p of old) await tx.period.update({ where: { id: p.id, divisionId: division.id }, data: { displayOrder: p.displayOrder + 1000 } });
      const periods = [];
      for (const p of manifest.periods) {
        const prev = old.find((o) => o.startTime === p.startTime);
        periods.push(prev ? await tx.period.update({ where: { id: prev.id, divisionId: division.id }, data: { ...p, isActive: true } }) : await tx.period.create({ data: { ...p, divisionId: division.id, isActive: true } }));
      }
      await tx.pointRule.updateMany({ where: { divisionId: division.id }, data: { isActive: false } });
      for (const { key, ...r } of manifest.rules) await tx.pointRule.create({ data: { ...r, divisionId: division.id, isActive: true } });
      const { managementPolicy, ...settings } = policySettings(manifest, periods);
      await tx.divisionSettings.update({ where: { divisionId: division.id }, data: settings as any });
      await tx.$executeRaw`UPDATE study_hall.division_settings SET management_policy=${JSON.stringify(managementPolicy)}::jsonb WHERE division_id=${division.id}`;
      // Verify all other divisions' configuration before committing the transaction.
      const after = await tx.$queryRaw<any[]>`SELECT jsonb_build_object('settings', (SELECT jsonb_agg(s) FROM study_hall.division_settings s WHERE s.division_id<>${division.id}), 'periods', (SELECT jsonb_agg(p) FROM study_hall.periods p WHERE p.division_id<>${division.id}), 'rules', (SELECT jsonb_agg(r) FROM study_hall.point_rules r WHERE r.division_id<>${division.id})) AS snapshot`;
      for (const key of ["settings", "periods", "rules"]) {
        const canonical = (rows: any[]) => JSON.stringify((rows ?? []).slice().sort((a, b) => a.id.localeCompare(b.id)));
        if (canonical(before[0].snapshot[key].filter((r: any) => r.division_id !== division.id)) !== canonical(after[0].snapshot[key])) throw new Error(`다른 직렬 ${key} 변경 감지. 전체 롤백합니다.`);
      }
      return { division: division.slug, periods: periods.length, rules: manifest.rules.length };
    }, { timeout: 60_000 });
    process.stdout.write(JSON.stringify({ ...result, backupPath, otherDivisionsUnchanged: true }, null, 2));
  } finally { await prisma.$disconnect(); }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/restart-police-policy.ts")) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
