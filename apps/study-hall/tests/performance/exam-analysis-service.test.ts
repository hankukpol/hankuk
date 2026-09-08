import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as assembler from "../../lib/exam-analysis-assembler";
import { DEFAULT_EXAM_ANALYSIS_SETTINGS } from "../../lib/exam-analysis-settings";
import type { RegularRawSource } from "../../lib/exam-analysis-types";

function source(): RegularRawSource {
  const session = { id: "current", divisionId: "d", examTypeId: "e", examDate: "2026-09-08", primarySubjectId: null, topic: null, fullScore: 100, itemCount: 1, externalCohortSize: 2, externalStats: { distribution: [{ score: 50, count: 1 }, { score: 80, count: 1 }], subjects: {}, regions: {} } };
  const participant = { divisionId: "d", sessionId: "current", studentId: "s", region: null, externalRank: 2, externalPercentile: 25, regionalRank: null, subjectScores: { a: 50 }, totalScore: 50, isPartial: false };
  return { divisionId: "d", examTypes: [{ id: "e", name: "시험", category: "REGULAR", subjects: [{ id: "a", name: "과목", isActive: true, totalItems: 1, pointsPerItem: 100 }] }],
    sessions: [session, { ...session, id: "previous", examDate: "2026-08-15" }, { ...session, id: "ancient", examDate: "2026-07-15" }, { ...session, id: "morning", examTypeId: "morning" }],
    participants: [participant, { ...participant, sessionId: "previous", totalScore: 80 }, { ...participant, sessionId: "ancient", totalScore: 90 }],
    students: [{ id: "s", divisionId: "d", name: "본인이름", studentNumber: "00123" }], targets: [],
    items: [{ divisionId: "d", sessionId: "current", subjectId: "a", itemNo: 1, position: 1, answerKey: "1", points: 100, correctRatePct: 80, choiceRates: {}, mostCommonWrong: null }],
    responses: [{ divisionId: "d", sessionId: "current", studentId: "s", subjectId: "a", itemNo: 1, answer: "2", isCorrect: false }] };
}

function harness(mock: boolean) {
  const raw = source(), calls: Array<{ model: string; args: { where?: Record<string, unknown>; select?: Record<string, boolean> } }> = [];
  const cacheCalls: Array<{ key: string[]; options: { tags: string[]; revalidate: number } }> = [];
  let settings = structuredClone(DEFAULT_EXAM_ANALYSIS_SETTINGS), mockReads = 0, trendReads = 0, settingsReads = 0;
  const state = { divisions: [{ id: "d", slug: "police" }], examTypesByDivision: { police: raw.examTypes }, examSessionsByDivision: { police: raw.sessions }, examSessionParticipantsByDivision: { police: raw.participants }, studentsByDivision: { police: raw.students }, scoreTargetsByDivision: { police: raw.targets }, examSessionItemsByDivision: { police: raw.items }, examItemResponsesByDivision: { police: raw.responses } };
  const model = (name: string, rows: unknown[]) => ({ findMany: async (args: { where?: Record<string, unknown> }) => {
    calls.push({ model: name, args });
    const w = args.where ?? {};
    return rows.filter(value => { const row = value as Record<string, unknown>;
      return (!w.divisionId || row.divisionId === w.divisionId || name === "examType")
        && (!w.examTypeId || row.examTypeId === w.examTypeId)
        && (!w.sessionId || (typeof w.sessionId === "string" ? row.sessionId === w.sessionId : (w.sessionId as { in: string[] }).in.includes(row.sessionId as string)));
    });
  } });
  const prisma = { division: { findUnique: async (args: { where: { slug: string } }) => { calls.push({ model: "division", args }); return args.where.slug === "police" ? { id: "d" } : null; } },
    examType: model("examType", raw.examTypes), examSession: model("examSession", raw.sessions), examSessionParticipant: model("examSessionParticipant", raw.participants), student: model("student", raw.students), examSessionItem: model("examSessionItem", raw.items), examItemResponse: model("examItemResponse", raw.responses), scoreTarget: model("scoreTarget", raw.targets) };
  const cache = new Map<string, Promise<unknown>>();
  const dependencies: Record<string, unknown> = {
    "next/cache": { unstable_cache: (fn: () => Promise<unknown>, key: string[], options: { tags: string[]; revalidate: number }) => { cacheCalls.push({ key, options }); return () => { const k = JSON.stringify(key); if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); }; } },
    "@/lib/mock-data": { isMockMode: () => mock }, "@/lib/mock-store": { readMockState: async () => { mockReads++; return state; } },
    "@/lib/errors": { forbidden: (message: string) => Object.assign(new Error(message), { status: 403 }), notFound: (message: string) => Object.assign(new Error(message), { status: 404 }) },
    "@/lib/exam-analysis-assembler": assembler, "@/lib/prisma": { prisma },
    "@/lib/services/settings.service": { getExamAnalysisSettings: async () => { settingsReads++; return settings; } },
    "@/lib/services/exam.service": { listStudentExamResults: async (slug: string, id: string) => { trendReads++; assert.equal(slug, "police"); assert.equal(id, "s"); return [{ id: "trend", examTypeId: "e", examTypeName: "시험", examRound: 1, examDate: null, totalScore: 80, rankInClass: 1, notes: "다른사람 실명", subjects: [], studentName: "유출금지" }]; } },
  };
  const code = ts.transpileModule(readFileSync(new URL("../../lib/services/exam-analysis.service.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((name: string) => { assert.ok(name in dependencies, `unexpected dependency ${name}`); return dependencies[name]; }, module, module.exports);
  return { service: module.exports as typeof import("../../lib/services/exam-analysis.service"), raw, calls, cacheCalls, setSettings: (value: typeof settings) => { settings = value; }, counts: () => ({ mockReads, trendReads, settingsReads }) };
}

test("regular service mock and scoped DB paths assemble identical cohort, session list and private report", async () => {
  const mock = harness(true), db = harness(false);
  assert.deepEqual(await mock.service.listRegularSessions("police", "e"), await db.service.listRegularSessions("police", "e"));
  assert.deepEqual(await mock.service.getRegularCohortAnalysis("police", "e", "2026-09-08"), await db.service.getRegularCohortAnalysis("police", "e", "2026-09-08"));
  const viewer = { role: "STUDENT", studentId: "s" } as const;
  const report = await db.service.getRegularStudentReport("police", "e", "2026-09-08", "s", viewer);
  assert.deepEqual(await mock.service.getRegularStudentReport("police", "e", "2026-09-08", "s", viewer), report);
  assert.equal(report.student.name, null); assert.match(report.student.studentNumber, /^\d{2}\*+$/);
  assert.equal(report.trend[0].notes, null); assert.ok(!JSON.stringify(report).includes("유출금지"));
  assert.ok(!JSON.stringify(report).includes('"examRound"'));
  assert.equal(mock.calls.length, 0); assert.equal(mock.cacheCalls.length, 0);
});

test("DB queries enforce tenant and current/previous session bounds; cache stores raw source and refreshes settings", async () => {
  const h = harness(false);
  const first = await h.service.getRegularCohortAnalysis("police", "e", "2026-09-08");
  assert.ok(first.ranking[0].flags.some(f => f.kind === "totalDrop"));
  const queries = h.calls.length;
  const settings = structuredClone(DEFAULT_EXAM_ANALYSIS_SETTINGS); settings.regular.totalDropPercent = 90; h.setSettings(settings);
  const second = await h.service.getRegularCohortAnalysis("police", "e", "2026-09-08");
  assert.ok(!second.ranking[0].flags.some(f => f.kind === "totalDrop"));
  assert.equal(h.calls.length, queries); assert.equal(h.counts().settingsReads, 2);
  assert.deepEqual(h.cacheCalls[0], { key: ["exam-analysis", "police", "e", "2026-09-08"], options: { tags: ["exam-analysis:police"], revalidate: 300 } });
  for (const call of h.calls) {
    const w = call.args.where!;
    if (call.model === "division") assert.equal(w.slug, "police");
    else if (call.model === "scoreTarget") { assert.deepEqual(w.examType, { divisionId: "d" }); assert.equal((w.student as { divisionId: string }).divisionId, "d"); }
    else assert.equal(w.divisionId, "d", call.model);
    if (call.model === "examItemResponse" || call.model === "examSessionItem") assert.equal(w.sessionId, "current");
    if (call.model === "examSessionParticipant") assert.deepEqual(w.sessionId, { in: ["current", "previous"] });
    if (call.model === "examItemResponse" || call.model === "examSessionParticipant") assert.ok(!("student" in w), "Phase1 models have no Prisma Student relation");
    if (call.model === "examSession") {
      const select = call.args.select!;
      assert.equal(select.primarySubjectId, true);
      assert.ok(!("examRound" in select));
    }
  }
  assert.equal(h.calls.filter(c => c.model === "examItemResponse").length, 1);
});

test("student IDOR rejected before reads; foreign/missing student never invokes trend", async () => {
  for (const mock of [true, false]) {
    const h = harness(mock);
    await assert.rejects(h.service.getRegularStudentReport("police", "e", "2026-09-08", "s", { role: "STUDENT", studentId: "other" }), (e: unknown) => (e as { status: number }).status === 403);
    assert.equal(h.calls.length, 0); assert.equal(h.counts().mockReads, 0);
    await assert.rejects(h.service.getRegularStudentReport("police", "e", "2026-09-08", "missing", { role: "ADMIN" }), /찾을 수 없습니다/);
    assert.equal(h.counts().trendReads, 0);
  }
});

test("optional student session filter is shared by mock and DB and keeps cohort participant count", async () => {
  const results = [];
  for (const mock of [true, false]) {
    const h = harness(mock);
    h.raw.students.push({ id: "peer", divisionId: "d", name: "동료", studentNumber: "00999" });
    h.raw.participants.push({ ...h.raw.participants[0], studentId: "peer" });
    h.raw.participants[1].studentId = "peer";
    const rows = await h.service.listRegularSessions("police", "e", "s");
    assert.deepEqual(rows.map(row => [row.examDate, row.participantCount]), [["2026-09-08", 2], ["2026-07-15", 1]]);
    assert.deepEqual(await h.service.listRegularSessions("police", "e", "legacy-only"), []);
    assert.equal((await h.service.listRegularSessions("police", "e")).length, 3);
    results.push(rows);
  }
  assert.deepEqual(results[0], results[1]);
});
