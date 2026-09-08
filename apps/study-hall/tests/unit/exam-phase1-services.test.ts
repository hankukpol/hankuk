import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as analysis from "../../lib/exam-analysis-settings";
import * as settingsSchemas from "../../lib/settings-schemas";
import * as features from "../../lib/division-features";
import * as points from "../../lib/point-meta";

// Execute real service code against explicit in-memory dependencies, never a DB or mock file.
function load<T>(name: string, stubs: Record<string, unknown>, internals: string[] = []): T {
  const source = readFileSync(new URL(`../../lib/services/${name}.service.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(`${source}\n${internals.length ? `export { ${internals.join(",")} };` : ""}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dependencies = {
    "@/lib/exam-analysis-settings": analysis, "@/lib/settings-schemas": settingsSchemas,
    "@/lib/division-features": features, "@/lib/point-meta": points,
    "@/lib/service-helpers": { normalizeOptionalText: (value?: string | null) => value?.trim() || null },
    "@/lib/mock-data": { isMockMode: () => true, getMockDivisionBySlug: () => undefined },
    "@/lib/errors": { notFound: (message: string) => new Error(message) },
    ...stubs,
  };
  const testModule = { exports: {} };
  new Function("require", "module", "exports", code)((id: string) => dependencies[id as keyof typeof dependencies] ?? {}, testModule, testModule.exports);
  return testModule.exports as T;
}

type SettingsService = typeof import("../../lib/services/settings.service");
test("mock rule roundtrip persists analysis and keeps another division untouched; omitted input preserves it", async () => {
  const state = { divisions: [{ id: "a", slug: "a" }, { id: "b", slug: "b" }], divisionSettingsByDivision: {} as Record<string, unknown>, pointRulesByDivision: {} };
  const service = load<SettingsService>("settings", {
    "@/lib/mock-store": { readMockState: async () => state, updateMockState: async (fn: (s: typeof state) => unknown) => fn(state) },
  });
  const current = await service.getDivisionRuleSettings("a");
  const other = await service.getDivisionRuleSettings("b");
  const input = settingsSchemas.rulesSettingsSchema.parse({ ...current, examAnalysis: { ...current.examAnalysis,
    regular: { ...current.examAnalysis.regular, totalDropPercent: 24 } } });
  assert.equal((await service.updateDivisionRuleSettings("a", input)).examAnalysis.regular.totalDropPercent, 24);
  assert.deepEqual(await service.getDivisionRuleSettings("b"), other);
  const { examAnalysis: ignored, ...oldClientInput } = input;
  assert.ok(ignored);
  assert.equal((await service.updateDivisionRuleSettings("a", oldClientInput)).examAnalysis.regular.totalDropPercent, 24);
});

test("DB serialization and legacy serialization normalize analysis with the same rules", () => {
  const service = load<{ serializeSettingsRecord(record: unknown): unknown; serializeLegacySettingsRecord(record: unknown): unknown }>("settings", {}, ["serializeSettingsRecord", "serializeLegacySettingsRecord"]);
  const legacy = { divisionId: "a", examAnalysis: { morning: { classGapPercent: 31 } }, updatedAt: new Date("2026-09-08T00:00:00Z") };
  const normalized = service.serializeLegacySettingsRecord(legacy) as { examAnalysis: analysis.ExamAnalysisSettings };
  const serialized = service.serializeSettingsRecord({ ...normalized, updatedAt: legacy.updatedAt }) as typeof normalized;
  assert.deepEqual(serialized.examAnalysis, normalized.examAnalysis);
  assert.equal(normalized.examAnalysis.morning.classGapPercent, 31);
});

test("exam subject serializers and payloads preserve alternate groups in mock and DB shapes", () => {
  type Subject = { id?: string; name: string; alternateGroup?: string | null; totalItems: number; pointsPerItem: number };
  const service = load<{
    buildSubjectPayload(division: string, type: string, subjects: Subject[]): Array<Subject>;
    toSubjectItem(subject: unknown): Subject;
  }>("exam", {}, ["buildSubjectPayload", "toSubjectItem"]);
  const payload = service.buildSubjectPayload("a", "type", [{ name: "S", alternateGroup: " group ", totalItems: 20, pointsPerItem: 2.5 }]);
  assert.equal(payload[0].alternateGroup, "group");
  assert.equal(service.toSubjectItem(payload[0]).alternateGroup, "group");
  assert.equal(service.toSubjectItem({ ...payload[0], alternateGroup: null }).alternateGroup, null);
});


test("analysis helpers preserve all other mock fields and reject invalid writes", async () => {
  const state = { divisions: [{ id: "a", slug: "a" }, { id: "b", slug: "b" }], divisionSettingsByDivision: {} as Record<string, Record<string, unknown>> };
  let writes = 0;
  const service = load<SettingsService>("settings", {
    "@/lib/prisma": { prisma: new Proxy({}, { get() { throw new Error("Mock touched DB"); } }) },
    "@/lib/mock-store": { readMockState: async () => state, updateMockState: async (fn: (s: typeof state) => unknown) => { writes++; return fn(state); } },
  });
  assert.deepEqual(await service.getExamAnalysisSettings("a"), analysis.DEFAULT_EXAM_ANALYSIS_SETTINGS);
  await service.getExamAnalysisSettings("b");
  state.divisionSettingsByDivision.a.warnLevel1 = 12;
  state.divisionSettingsByDivision.a.futureField = { retained: true };
  const before = structuredClone(state);
  const input = analysis.normalizeExamAnalysisSettings({ morning: { classGapPercent: 32 } });
  assert.deepEqual(await service.updateExamAnalysisSettings("a", input), input);
  assert.deepEqual(await service.getExamAnalysisSettings("a"), input);
  const { examAnalysis: ignored, updatedAt: timestamp, ...rest } = state.divisionSettingsByDivision.a;
  const { examAnalysis: old, updatedAt: oldTimestamp, ...previous } = before.divisionSettingsByDivision.a;
  assert.deepEqual(rest, previous);
  assert.deepEqual(state.divisionSettingsByDivision.b, before.divisionSettingsByDivision.b);
  const validWrites = writes;
  const snapshot = structuredClone(state);
  for (const morning of [{ consecutiveDrops: 1 }, { movingAverageDays: 31 }, { trendWindowDays: 91 }, { movingAverageDays: 30, trendWindowDays: 7 }]) {
    await assert.rejects(service.updateExamAnalysisSettings("a", { ...input, morning: { ...input.morning, ...morning } }));
  }
  assert.equal(writes, validWrites);
  assert.deepEqual(state, snapshot);
  await assert.rejects(service.getExamAnalysisSettings("missing"), /지점/);
  await assert.rejects(service.updateExamAnalysisSettings("missing", input), /지점/);
  assert.deepEqual(state, snapshot);
});

test("analysis DB helper writes only analysis and shares rule cache invalidation", async () => {
  const input = analysis.normalizeExamAnalysisSettings({ regular: { totalDropPercent: 26 } });
  const tags: string[] = [];
  const paths: unknown[][] = [];
  const row = { warnLevel1: 10, futureField: "keep", examAnalysis: {} as unknown };
  let writes = 0;
  let missing = false;
  let fail = false;
  const service = load<SettingsService>("settings", {
    "@/lib/mock-data": { isMockMode: () => false },
    "next/cache": { revalidateTag: (tag: string) => tags.push(tag), revalidatePath: (...args: unknown[]) => paths.push(args), unstable_cache: (fn: unknown) => fn },
    "@/lib/prisma": { prisma: {
      division: { findUnique: async (args: unknown) => {
        assert.deepEqual(args, { where: { slug: "a" }, select: { id: true } });
        row.warnLevel1 = 17; // Simulate another rule edit before this write.
        return missing ? null : { id: "division-a" };
      } },
      divisionSettings: {
        findUnique: async () => ({ ...row, divisionId: "division-a", updatedAt: new Date() }),
        upsert: async (args: { where: unknown; update: object; create: { divisionId: string; examAnalysis: unknown }; select: unknown }) => {
          writes++;
          assert.deepEqual(args.where, { divisionId: "division-a" });
          assert.deepEqual(args.update, { examAnalysis: input });
          assert.equal(args.create.divisionId, "division-a");
          assert.deepEqual(args.create.examAnalysis, input);
          assert.deepEqual(args.select, { examAnalysis: true });
          if (fail) throw new Error("schema unavailable");
          Object.assign(row, args.update);
          return { examAnalysis: row.examAnalysis };
        },
      },
    } },
  });
  assert.deepEqual(await service.updateExamAnalysisSettings("a", input), input);
  assert.equal(row.warnLevel1, 17);
  assert.equal(row.futureField, "keep");
  assert.deepEqual(await service.getExamAnalysisSettings("a"), input);
  assert.deepEqual(tags, ["division-settings:a", "admin-dashboard", "super-admin-overview", "super-admin-student-trend", "super-admin-tuition-status", "report-data"]);
  for (const role of ["admin", "assistant", "student"]) {
    assert.ok(paths.some((p) => p[0] === "/a/" + role && p[1] === "layout"));
    assert.ok(paths.some((p) => p[0] === "/a/" + role && p.length === 1));
  }
  const invalid = { ...input, morning: { ...input.morning, consecutiveDrops: 11 } };
  await assert.rejects(service.updateExamAnalysisSettings("a", invalid));
  assert.equal(writes, 1);
  missing = true;
  await assert.rejects(service.updateExamAnalysisSettings("a", input), /지점/);
  assert.equal(writes, 1);
  missing = false;
  fail = true;
  tags.length = 0;
  paths.length = 0;
  await assert.rejects(service.updateExamAnalysisSettings("a", input), /schema unavailable/);
  assert.deepEqual(tags, []);
  assert.deepEqual(paths, []);
});
