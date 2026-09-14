import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const day = "2026-09-08";
const actor = { id: "admin", role: "ADMIN" as const };
const input = { examTypeId: "morning", subjectId: "new-subject", date: day, rows: [{ studentId: "student", score: 60 }] };

for (const mock of [true, false]) {
  for (const imported of [true, false]) {
    test(`${mock ? "mock" : "DB"}: morning score edits ${imported ? "protect imported items even when changing subject" : "remain available for manual exams"}`, async () => {
      const original = { studentId: "student", examTypeId: "morning", subjectId: "old-subject", examDate: day, score: 90 };
      const state = {
        studentsByDivision: { police: [{ id: "student" }] },
        morningExamScoresByDivision: { police: [original] },
        examSessionsByDivision: { police: imported ? [{ examTypeId: "morning", examDate: day }] : [] },
      };
      let writes = 0;
      let locked = false;
      const prisma = {
        division: { findUnique: async () => ({ id: "police" }) },
        student: { count: async () => 1 },
        $queryRaw: async (_sql: unknown, ...values: string[]) => { assert.deepEqual(values, ["morning", "police"]); locked = true; },
        examSession: { findFirst: async (query: { where: { divisionId: string; examDate: Date; examTypeId: string } }) => {
          assert.equal(locked, true);
          assert.deepEqual(query.where, { divisionId: "police", examDate: new Date(`${day}T00:00:00Z`), examTypeId: "morning" });
          return imported ? { id: "session" } : null;
        } },
        morningExamScore: { deleteMany: async () => { writes++; }, upsert: async () => { writes++; } },
        $transaction: async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => fn(prisma),
      };
      const dependencies: Record<string, unknown> = {
        "@/lib/mock-data": { isMockMode: () => mock },
        "@/lib/mock-store": { updateMockState: async (fn: (value: typeof state) => unknown) => fn(state) },
        "@/lib/errors": { notFound: (msg: string) => new Error(msg), badRequest: (msg: string) => new Error(msg), conflict: (msg: string) => new Error(msg) },
        "@/lib/services/exam.service": { listExamTypes: async () => [{ id: "morning", category: "MORNING", subjects: [{ id: "new-subject", isActive: true }] }] },
        "@/lib/services/student.service": {},
        "@/lib/prisma": { prisma },
      };
      const code = ts.transpileModule(readFileSync("lib/services/morning-exam.service.ts", "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      const mod = { exports: {} };
      new Function("require", "module", "exports", code)((id: string) => {
        assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
        return dependencies[id];
      }, mod, mod.exports);
      const api = mod.exports as typeof import("../../lib/services/morning-exam.service");
      if (imported) {
        await assert.rejects(api.saveMorningExamScores("police", actor, input), /다시 가져/);
        assert.equal(writes, 0);
        assert.deepEqual(state.morningExamScoresByDivision.police, [original]);
      } else {
        assert.deepEqual(await api.saveMorningExamScores("police", actor, input), { savedCount: 1 });
        if (mock) assert.equal(state.morningExamScoresByDivision.police[0].score, 60);
        else assert.equal(writes, 2);
      }
    });
  }
}
