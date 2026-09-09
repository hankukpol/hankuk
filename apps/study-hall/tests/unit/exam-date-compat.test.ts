import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as meta from "../../lib/exam-meta";
import * as identity from "../../lib/exam-session-identity";

const date = "2026-08-15";
const students = ["old", "import", "new"].map(id => ({ id, name: id, studentNumber: id, studyTrack: null, status: "ACTIVE" }));
const type = { id: "t", divisionId: "a", name: "시험", category: "REGULAR", studyTrack: null, isActive: true, displayOrder: 0, createdAt: new Date(), updatedAt: new Date(), subjects: [{ id: "s", name: "과목", totalItems: 20, pointsPerItem: 5, isActive: true, displayOrder: 0 }] };
const record = (studentId: string, examRound: number, examDate = date) => ({ id: studentId, studentId, examTypeId: "t", examRound, examDate, scores: { s: 70 }, totalScore: 70, rankInClass: 1, notes: null, recordedById: "admin", createdAt: "2026-01-01", updatedAt: "2026-01-01" });
function service(mock: boolean) {
  const state = { examTypesByDivision: { a: [type] }, examScoresByDivision: { a: [record("old", 2), record("import", 20260815), record("otherDate", 3, "2026-07-01")], b: [record("foreign", 2)] } };
  const queries: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const writes: any[] = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const prisma = {
    division: { findUnique: async () => ({ id: "a" }) },
    examType: { findMany: async () => [type] },
    student: { findMany: async ({ where }: any) => students.filter(s => where.id.in.includes(s.id)) }, // eslint-disable-line @typescript-eslint/no-explicit-any
    examScore: {
      findMany: async (query: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        queries.push(query);
        assert.ok(query.where.student.divisionId === "a" || query.where.student.division?.slug === "a");
        return state.examScoresByDivision.a.filter(row => query.where.examDate ? row.examDate === query.where.examDate.toISOString().slice(0, 10) : row.examRound === query.where.examRound);
      },
      upsert: (write: any) => { writes.push(write); return Promise.resolve(); }, // eslint-disable-line @typescript-eslint/no-explicit-any
    },
    $transaction: (values: Promise<unknown>[]) => Promise.all(values),
  };
  const dependencies: Record<string, unknown> = {
    "@/lib/exam-meta": meta, "@/lib/exam-session-identity": identity,
    "@/lib/mock-data": { isMockMode: () => mock },
    "@/lib/mock-store": { readMockState: async () => state, updateMockState: async (fn: (s: typeof state) => void) => fn(state) },
    "@/lib/errors": { notFound: (message: string) => new Error(message) },
    "@/lib/services/student.service": { listStudents: async () => students },
    "@/lib/prisma": { prisma }, "@/lib/service-helpers": {},
  };
  const code = ts.transpileModule(readFileSync(new URL("../../lib/services/exam.service.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)((name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; }, mod, mod.exports);
  return { api: mod.exports as typeof import("../../lib/services/exam.service"), state, queries, writes };
}

const input = { examTypeId: "t", examDate: date, rows: students.map(s => ({ studentId: s.id, scores: { s: 80 } })) };
const actor = { id: "admin", role: "ADMIN" as const };

test("date validation rejects rolled-over dates and accepts legacy payloads", () => {
  assert.equal(meta.examScoresSaveSchema.safeParse({ ...input, examDate: "2026-02-30" }).success, false);
  assert.equal(meta.examScoresSaveSchema.safeParse({ ...input, examDate: null }).success, false);
  assert.equal(meta.examScoresSaveSchema.parse({ ...input, examDate: null, examRound: 2 }).examRound, 2);
  assert.equal(identity.getLegacyExamDateKey(date), 20260815);
});
for (const mock of [true, false]) {
  test(`${mock ? "mock" : "DB stub"}: date reads legacy and imported scores, round reads remain compatible`, async () => {
    const { api } = service(mock);
    const sheet = await api.getExamScoreSheet("a", "t", date);
    assert.equal(sheet.examDate, date);
    assert.deepEqual(sheet.rows.map(row => row.totalScore), [70, 70, null]);
    const old = await api.getExamScoreSheet("a", "t", 2);
    assert.deepEqual(old.rows.map(row => row.totalScore), [70, null, null]);
  });
  test(`${mock ? "mock" : "DB stub"}: date save reuses old keys and allocates date key only for new rows`, async () => {
    const { api, state, writes } = service(mock);
    const other = structuredClone(state.examScoresByDivision.b);
    await api.saveExamScores("a", actor, input);
    if (mock) {
      assert.equal(state.examScoresByDivision.a.find(row => row.studentId === "old")!.examRound, 2);
      assert.equal(state.examScoresByDivision.a.find(row => row.studentId === "import")!.examRound, 20260815);
      assert.equal(state.examScoresByDivision.a.find(row => row.studentId === "new")!.examRound, 20260815);
      assert.equal(state.examScoresByDivision.a.length, 4);
      assert.deepEqual(state.examScoresByDivision.b, other);
    } else {
      assert.deepEqual(writes.map(write => write.where.studentId_examTypeId_examRound.examRound), [2, 20260815, 20260815]);
      assert.ok(writes.every(write => write.update.examDate.toISOString().slice(0, 10) === date));
    }
  });
}

test("duplicate date rows choose the date key consistently without mutating source", () => {
  const rows = [record("old", 2), record("old", 20260815)];
  assert.equal(meta.selectExamDateRecords(rows, date).get("old")!.examRound, 20260815);
  assert.equal(rows[0].examRound, 2);
});

function route() {
  const calls: unknown[][] = [];
  const response = { json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) };
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: response },
    "@/lib/exam-meta": meta,
    "@/lib/api-auth": { requireApiAuth: async () => ({ ok: true, session: actor }) },
    "@/lib/division-feature-guard": { getDivisionFeatureDisabledError: async () => null },
    "@/lib/api-error-response": { getZodErrorMessage: () => "입력 오류", toApiErrorResponse: () => ({ status: 400 }) },
    "@/lib/services/exam.service": {
      getExamScoreSheet: async (...args: unknown[]) => { calls.push(args); return {}; },
      saveExamScores: async (...args: unknown[]) => { calls.push(args); return {}; },
    },
  };
  const code = ts.transpileModule(readFileSync(new URL("../../app/api/[division]/exams/route.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)((name: string) => dependencies[name], mod, mod.exports);
  return { api: mod.exports as { GET(request: unknown, context: unknown): Promise<{status: number}>; POST(request: unknown, context: unknown): Promise<{status: number}> }, calls };
}
test("API accepts date GET and date-only POST; old round GET still works", async () => {
  const { api, calls } = route(); const context = { params: { division: "a" } };
  assert.equal((await api.GET({ nextUrl: new URL(`http://local/?examTypeId=t&examDate=${date}`) }, context)).status, 200);
  assert.deepEqual(calls.pop(), ["a", "t", date]);
  assert.equal((await api.GET({ nextUrl: new URL("http://local/?examTypeId=t&examRound=2") }, context)).status, 200);
  assert.deepEqual(calls.pop(), ["a", "t", 2]);
  assert.equal((await api.POST({ json: async () => input }, context)).status, 200);
  assert.equal((calls.pop()![2] as { examRound?: number }).examRound, undefined);
  assert.equal((await api.GET({ nextUrl: new URL("http://local/?examTypeId=t&examDate=2026-02-30") }, context)).status, 400);
  assert.equal((await api.GET({ nextUrl: new URL("http://local/?examTypeId=t&examRound=1.5") }, context)).status, 400);
});
