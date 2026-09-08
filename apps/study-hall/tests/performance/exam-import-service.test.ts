import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { isDeepStrictEqual } from "node:util";
import * as history from "../../lib/exam-import-history";
import * as assembler from "../../lib/exam-import-assembler";
import * as identity from "../../lib/exam-session-identity";
import { ExamImportParseError, type ParsedExamImport } from "../../lib/exam-import-parser";
import type { ExamImportSelection } from "../../lib/exam-import-types";

type Service = typeof import("../../lib/services/exam-import.service");
type Row = Record<string, unknown>;
const tables = ["examType", "student", "examSession", "examSessionItem", "examSessionParticipant", "examItemResponse", "examScore", "morningExamScore"] as const;
type Table = typeof tables[number];
type Store = Record<Table, Row[]>;
const mockKeys: Record<Table, string> = { examType: "examTypesByDivision", student: "studentsByDivision", examSession: "examSessionsByDivision", examSessionItem: "examSessionItemsByDivision", examSessionParticipant: "examSessionParticipantsByDivision", examItemResponse: "examItemResponsesByDivision", examScore: "examScoresByDivision", morningExamScore: "morningExamScoresByDivision" };
const divisions = [{ id: "division-a", slug: "a" }, { id: "division-b", slug: "b" }];
const actor = { id: "admin-a", role: "ADMIN" as const, divisionId: "division-a" };
const files = { scoreBuffer: Buffer.from("grading"), analysisBuffer: Buffer.from("analysis") };

function fixture(category: "REGULAR" | "MORNING") {
  const point = category === "REGULAR" ? 125 : 50;
  const parsed: ParsedExamImport = {
    meta: { examDate: "2026-09-08", cohortSize: 3, subjectNames: ["Subject"] },
    moon: [1, 2].map((itemNo) => ({ subjectName: "Subject", itemNo, answerKey: String(itemNo), correctRatePct: 60, choiceRates: { "1": 60, "2": 40 }, mostCommonWrong: "2" })),
    score: ["90001", "90002", "90003"].map((studentNumber, i) => ({ studentNumber, sourceRow: i + 2, region: "R", scores: { [category === "MORNING" ? "객관식" : "Subject"]: i === 1 ? point : 2 * point } })),
    errata: ["90001", "90002", "90003"].map((studentNumber, i) => ({ studentNumber, sourceRow: i * 3 + 2, blocks: [{ blockIndex: 0, itemNumbers: [1, 2], answerKeys: ["1", "2"], answers: ["1", i === 1 ? "1" : "2"], marks: ["O", i === 1 ? "X" : "O"] }] })),
  };
  const store: Store = { examType: [], student: [], examSession: [], examSessionItem: [], examSessionParticipant: [], examItemResponse: [], examScore: [], morningExamScore: [] };
  for (const division of divisions) {
    store.examType.push({ id: `type-${division.slug}`, divisionId: division.id, name: "Exam", category, isActive: true, subjects: [{ id: `subject-${division.slug}`, name: "Subject", totalItems: 2, pointsPerItem: point, isActive: true }] });
    store.student.push(...[1, 2].map((n) => ({ id: `student-${division.slug}-${n}`, divisionId: division.id, name: `Student ${division.slug}${n}`, studentNumber: `9000${n}` })));
  }
  const selection: ExamImportSelection = { category, examTypeId: "type-a", topic: "Unit 1" };
  return { parsed, store, selection };
}

function evaluate<T>(filename: string, dependencies: Record<string, unknown>, suffix = ""): T {
  const source = readFileSync(new URL(`../../lib/${filename}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source + suffix, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} };
  new Function("require", "module", "exports", code)((id: string) => {
    if (!(id in dependencies)) throw new Error(`Unstubbed dependency: ${id}`);
    return dependencies[id];
  }, testModule, testModule.exports);
  return testModule.exports as T;
}

function actualMockUpdater(read: () => Record<string, unknown>, persist: (state: Record<string, unknown>) => void) {
  const source = readFileSync(new URL("../../lib/mock-store.ts", import.meta.url), "utf8");
  const updater = source.slice(source.indexOf("export async function updateMockState<T>"));
  assert.ok(updater.startsWith("export async function updateMockState<T>"));
  const code = ts.transpileModule(updater, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const testModule = { exports: {} as { updateMockState: (callback: (state: Record<string, unknown>) => unknown) => Promise<unknown> } };
  new Function("module", "exports", "withMockStateLock", "ensureMockStateFile", "readNormalizedMockStateFile", "persistMockState", "normalizeMockState", code)(
    testModule, testModule.exports, (fn: () => unknown) => fn(), async () => {}, read,
    (serialized: string) => persist(JSON.parse(serialized)), (state: unknown) => state,
  );
  return testModule.exports.updateMockState;
}

function harness(mock: boolean, category: "REGULAR" | "MORNING") {
  const data = fixture(category);
  let store = data.store;
  let id = 0;
  let failAfterId: number | undefined;
  let failDeleteTable: Table | undefined;
  let beforeDelete: ((table: Table, current: Store) => void) | undefined;
  const calls: Array<{ table: string; operation: string; args: Row }> = [];
  const snapshots = () => structuredClone(store);
  const sameDate = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : value;
  function matches(row: Row, where: Row, current: Store): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (key === "OR") return (value as Row[]).some((condition) => matches(row, condition, current));
      if (key === "examType" || key === "student") {
        const parent = current[key].find((item) => item.id === row[`${key}Id`]);
        return !!parent && matches(parent, value as Row, current);
      }
      if (value && typeof value === "object" && !(value instanceof Date)) {
        if ("equals" in value) return isDeepStrictEqual(row[key], (value as { equals: unknown }).equals);
        return ((value as { in: unknown[] }).in).includes(row[key]);
      }
      if (key === "examDate") return sameDate(row[key]) === sameDate(value);
      const scalar = (v: unknown) => v instanceof Date ? v.toISOString() : v;
      return scalar(row[key]) === scalar(value);
    });
  }
  function client(current: Store) {
    const db: Record<string, unknown> = {};
    for (const table of tables) db[table] = {
      findMany: async (args: { where: Row }) => {
        calls.push({ table, operation: "read", args });
        return structuredClone(current[table].filter((row) => matches(row, args.where, current)));
      },
      deleteMany: async (args: { where: Row }) => {
        calls.push({ table, operation: "delete", args });
        if (table === failDeleteTable) throw new Error("injected delete failure");
        beforeDelete?.(table, current);
        const before = current[table].length;
        current[table] = current[table].filter((row) => !matches(row, args.where, current));
        return { count: before - current[table].length };
      },
      create: async (args: { data: Row }) => { calls.push({ table, operation: "create", args }); current[table].push(structuredClone(args.data)); },
      createMany: async (args: { data: Row[] }) => { calls.push({ table, operation: "create", args }); current[table].push(...structuredClone(args.data)); },
    };
    db.admin = { findMany: async (args: { where: Row }) => {
      calls.push({ table: "admin", operation: "read", args });
      return admins.filter((row) => matches(row, args.where, current));
    } };
    db.$queryRaw = async (_sql: TemplateStringsArray, ...values: unknown[]) => { calls.push({ table: "examType", operation: "lock", args: { values } }); return []; };
    return db;
  }
  const admins = [{ id: "admin-a", name: "Admin A", divisionId: "division-a", role: "ADMIN" },
    { id: "admin-b", name: "Admin B", divisionId: "division-b", role: "ADMIN" },
    { id: "super", name: "Super", divisionId: null, role: "SUPER_ADMIN" }];
  const error = (message: string) => new Error(message);
  const dependencies = {
    "next/cache": { revalidateTag: (tag: string) => calls.push({ table: "cache", operation: "invalidate", args: { tag } }) },
    "node:crypto": { randomUUID: () => { id++; if (id === failAfterId) throw new Error("injected late failure"); return `generated-${id}`; } },
    "@/lib/exam-import-assembler": assembler,
    "@/lib/exam-import-parser": { ExamImportParseError, parseExamImportPair: () => structuredClone(data.parsed) },
    "@/lib/exam-session-identity": identity,
    "@/lib/exam-import-history": history,
    "@/lib/errors": { badRequest: error, conflict: error, forbidden: error, notFound: error },
    "@/lib/mock-data": { isMockMode: () => mock },
    "@/lib/service-helpers": {
      getDivisionBySlugOrThrow: async (slug: string) => { const d = divisions.find((row) => row.slug === slug); if (!d) throw error("missing"); return d; },
      getPrismaClient: async () => ({ ...client(store), $transaction: async (callback: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const draft = structuredClone(store); const result = await callback(client(draft)); store = draft; return result;
      } }),
    },
    // The week helper is orthogonal to persistence; pin its known date result.
    "@/lib/services/morning-exam.service": { getIsoWeekInfo: () => ({ weekYear: 2026, weekNumber: 37 }) },
    "@/lib/mock-store": {
      readMockState: async () => toMock(),
      // Run the actual persistence ordering, stubbing only filesystem/normalization/lock boundaries.
      updateMockState: actualMockUpdater(toMock, (draft) => {
        for (const table of tables) store[table] = divisions.flatMap((division) => ((draft[mockKeys[table]] as Record<string, Row[]>)[division.slug]));
      }),
    },
  };
  function toMock(): Record<string, unknown> {
    return { divisions, admins, ...Object.fromEntries(tables.map((table) => [mockKeys[table], Object.fromEntries(divisions.map((division) => [division.slug, structuredClone(store[table].filter((row) => table === "examScore" || table === "morningExamScore" ? String(row.examTypeId).endsWith(division.slug) : row.divisionId === division.id))]))])) };
  }
  const service = evaluate<Service>("services/exam-import.service.ts", dependencies);
  return { service, data, calls, snapshots, failAtId: (value: number) => { failAfterId = value; },
    edit: (fn: (state: Store) => void) => fn(store),
    failDelete: (table: Table) => { failDeleteTable = table; },
    beforeDelete: (callback: (table: Table, current: Store) => void) => { beforeDelete = callback; } };
}

function comparable(store: Store) {
  const clean = (value: unknown): unknown => {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !["createdAt", "updatedAt", "importedAt"].includes(key)).map(([key, v]) => [key, clean(v)]));
  };
  return clean(store);
}

for (const category of ["REGULAR", "MORNING"] as const) {
  test(`import mock/DB preview and persistence parity with legacy ${category} entries`, async () => {
    const mock = harness(true, category), db = harness(false, category);
    assert.deepEqual(await mock.service.previewExamImport("a", actor, files, mock.data.selection), await db.service.previewExamImport("a", actor, files, db.data.selection));
    const before = db.snapshots();
    const m = await mock.service.confirmExamImport("a", actor, files, mock.data.selection);
    const d = await db.service.confirmExamImport("a", actor, files, db.data.selection);
    assert.deepEqual(m, d);
    assert.equal(m.importedCount, 2);
    assert.deepEqual(comparable(mock.snapshots()), comparable(db.snapshots()));
    const saved = db.snapshots();
    assert.equal(saved.examSession[0].fullScore, category === "REGULAR" ? 250 : 100);
    assert.equal(saved.examSessionParticipant.length, 2);
    assert.equal(saved.examItemResponse.length, 4);
    const scores = saved[category === "REGULAR" ? "examScore" : "morningExamScore"];
    assert.deepEqual(scores.map((row) => row[category === "REGULAR" ? "totalScore" : "score"]), category === "REGULAR" ? [250, 125] : [100, 50]);
    assert.deepEqual(saved.student, before.student);
    for (const call of db.calls.filter((entry) => ["read", "delete"].includes(entry.operation))) {
      const where = call.args.where as Row;
      if (["examScore", "morningExamScore"].includes(call.table)) {
        assert.deepEqual(where.examType, { divisionId: "division-a" }); assert.deepEqual(where.student, { divisionId: "division-a" });
      } else assert.equal(where.divisionId, "division-a");
    }
    for (const table of ["examSession", "examSessionItem", "examSessionParticipant", "examItemResponse"] as const) assert.ok(saved[table].every((row) => row.divisionId === "division-a"));
    assert.deepEqual(db.calls.find((call) => call.operation === "lock")?.args.values, ["type-a", "division-a"]);
    assert.deepEqual(db.calls.filter((call) => call.operation === "invalidate").map((call) => call.args.tag), ["exam-analysis:a"]);
  });
}

for (const mock of [true, false]) {
  test(`import authorization, reproduction mismatch and missing overwrite perform no writes (${mock ? "mock" : "DB"})`, async () => {
    for (const reason of ["role", "division", "mismatch", "overwrite", "foreign-type"] as const) {
      const h = harness(mock, "REGULAR");
      if (reason === "mismatch") h.data.parsed.score[0].scores.Subject = 999;
      if (reason === "overwrite") h.edit((s) => s.examScore.push({ examTypeId: "type-a", studentId: "student-a-1", examRound: 7, examDate: "2026-09-08" }));
      const before = h.snapshots();
      await assert.rejects(h.service.confirmExamImport("a", reason === "role" ? { ...actor, role: "ASSISTANT" } : reason === "division" ? { ...actor, divisionId: "division-b" } : actor, files,
        reason === "foreign-type" ? { ...h.data.selection, examTypeId: "type-b" } : h.data.selection));
      assert.deepEqual(h.snapshots(), before);
      assert.equal(h.calls.filter((entry) => ["create", "delete"].includes(entry.operation)).length, 0);
    }
  });

  test(`overwrite replaces stale children and legacy scores but preserves other dates and tenants (${mock ? "mock" : "DB"})`, async () => {
    const h = harness(mock, "REGULAR");
    await h.service.confirmExamImport("a", actor, files, h.data.selection);
    h.edit((s) => {
      s.examScore.push({ examTypeId: "type-a", studentId: "student-a-1", examRound: 2, examDate: "2026-09-07", totalScore: 77 }, { examTypeId: "type-b", studentId: "student-b-1", examRound: 1, examDate: "2026-09-08", totalScore: 88 });
    });
    const oldSession = h.snapshots().examSession[0].id;
    h.data.parsed.score = h.data.parsed.score.filter((row) => row.studentNumber !== "90002");
    h.data.parsed.errata = h.data.parsed.errata.filter((row) => row.studentNumber !== "90002");
    await h.service.confirmExamImport("a", actor, files, { ...h.data.selection, overwrite: true });
    const saved = h.snapshots();
    assert.equal(saved.examSession.length, 1);
    assert.notEqual(saved.examSession[0].id, oldSession);
    assert.equal(saved.examSessionParticipant.length, 1);
    assert.equal(saved.examItemResponse.length, 2);
    assert.ok(saved.examSessionItem.every((row) => row.sessionId !== oldSession));
    assert.deepEqual(saved.examScore.filter((row) => row.examTypeId === "type-b" || row.examRound === 2).map((row) => row.totalScore), [77, 88]);
    assert.equal(saved.examScore.filter((row) => row.examTypeId === "type-a" && row.examRound === 20260908).length, 1);
  });

  test(`late failure rolls back partially built import (${mock ? "mock updater" : "DB transaction"})`, async () => {
    const h = harness(mock, "REGULAR");
    const before = h.snapshots();
    h.failAtId(5); // after session and items, while constructing participant rows
    await assert.rejects(h.service.confirmExamImport("a", actor, files, h.data.selection), /injected late failure/);
    assert.deepEqual(h.snapshots(), before);
  });

  test(`morning overwrite removes stale students only for selected date and subject (${mock ? "mock" : "DB"})`, async () => {
    const h = harness(mock, "MORNING");
    await h.service.confirmExamImport("a", actor, files, h.data.selection);
    h.edit((s) => s.morningExamScore.push(
      { examTypeId: "type-a", studentId: "student-a-1", subjectId: "subject-a", examDate: "2026-09-07", score: 77 },
      { examTypeId: "type-a", studentId: "student-a-1", subjectId: "other", examDate: "2026-09-08", score: 66 },
      { examTypeId: "type-b", studentId: "student-b-1", subjectId: "subject-b", examDate: "2026-09-08", score: 88 },
    ));
    const before = h.snapshots();
    await assert.rejects(h.service.confirmExamImport("a", actor, files, h.data.selection), /덮어쓰기/);
    assert.deepEqual(h.snapshots(), before);
    h.data.parsed.score = h.data.parsed.score.filter((row) => row.studentNumber !== "90002");
    h.data.parsed.errata = h.data.parsed.errata.filter((row) => row.studentNumber !== "90002");
    await h.service.confirmExamImport("a", actor, files, { ...h.data.selection, overwrite: true });
    const scores = h.snapshots().morningExamScore;
    assert.equal(scores.length, 4);
    assert.deepEqual(scores.map((row) => row.score).sort(), [100, 66, 77, 88]);
    assert.equal(scores.find((row) => row.score === 100)?.studentId, "student-a-1");
  });
}

for (const mock of [true, false]) {
  test(`date identity ignores old round numbers and uses deterministic legacy adapter (${mock})`, async () => {
    const h = harness(mock, "REGULAR");
    const first = await h.service.confirmExamImport("a", actor, files, h.data.selection);
    assert.equal("examRound" in first, false);
    assert.equal(h.snapshots().examSession[0].identityKey, "regular:2026-09-08");
    assert.equal("examRound" in h.snapshots().examSession[0], false);
    assert.equal(h.snapshots().examSession[0].primarySubjectId, null);
    assert.ok(h.snapshots().examScore.every((row) => row.examRound === 20260908));
    h.data.parsed.meta.examDate = "2026-09-01"; // upload out of order, never max+1
    await h.service.confirmExamImport("a", actor, files, h.data.selection);
    assert.deepEqual(h.snapshots().examScore.map((row) => row.examRound), [20260908, 20260908, 20260901, 20260901]);
    h.data.parsed.meta.examDate = "2026-09-08";
    assert.equal((await h.service.previewExamImport("a", actor, files, h.data.selection)).existing, true);
  });

  for (const category of ["REGULAR", "MORNING"] as const) {
    test(`history lists scoped dates and deletion removes only proven ${category} records (${mock})`, async () => {
      const h = harness(mock, category);
      assert.deepEqual(await h.service.listExamImports("a", actor), []);
      const first = await h.service.confirmExamImport("a", actor, files, h.data.selection);
      const original = h.snapshots();
      const table = category === "REGULAR" ? "examScore" : "morningExamScore";
      for (const participant of original.examSessionParticipant) {
        const derived = original[table].find((row) => row.id === participant.derivedScoreId)!;
        assert.deepEqual(participant.derivedScoreSnapshot, history.derivedScoreSnapshot(derived as history.DerivedScore));
      }
      h.data.parsed.meta.examDate = "2026-09-09";
      const second = await h.service.confirmExamImport("a", actor, files, h.data.selection);
      const rows = await h.service.listExamImports("a", actor);
      assert.deepEqual(rows.map((row) => row.sessionId), [second.sessionId, first.sessionId]);
      assert.deepEqual(rows.map((row) => row.examDate), ["2026-09-09", "2026-09-08"]);
      assert.equal(rows[0].matchedStudentCount, 2);
      assert.equal(rows[0].importedByName, "Admin A");
      assert.equal(rows[0].primarySubjectName, category === "MORNING" ? "Subject" : null);
      assert.equal(rows[0].topic, "Unit 1");
      assert.equal(rows[0].externalCohortSize, 3);
      assert.deepEqual(await h.service.listExamImports("a", actor, { examTypeId: "type-b" }), []);
      assert.deepEqual(await h.service.listExamImports("b", { ...actor, id: "super", role: "SUPER_ADMIN", divisionId: null }), []);
      const beforeDelete = h.calls.length;
      assert.deepEqual(await h.service.deleteExamImport("a", actor, first.sessionId), { removedStudents: 2, keptManualScores: 0 });
      const saved = h.snapshots();
      assert.equal(saved.examSession.length, 1);
      assert.equal(saved.examSessionParticipant.length, 2);
      assert.equal(saved.examSessionItem.length, 2);
      assert.equal(saved.examItemResponse.length, 4);
      assert.equal(saved[table].length, 2);
      assert.ok(saved[table].every((row) => history.examDateString(row.examDate as Date | string) === "2026-09-09"));
      if (!mock) {
        const deletes = h.calls.slice(beforeDelete).filter((call) => call.operation === "delete");
        assert.deepEqual(deletes.map((call) => call.table), ["examItemResponse", "examSessionParticipant", "examSessionItem", table, table, "examSession"]);
        for (const call of deletes) {
          const where = call.args.where as Row;
          if (call.table === table) {
            assert.deepEqual(where.examType, { divisionId: "division-a" });
            assert.deepEqual(where.student, { divisionId: "division-a" });
            assert.ok(where.updatedAt); assert.ok(where.createdAt); assert.ok(where.id);
          } else assert.equal(where.divisionId, "division-a");
        }
      }
      assert.deepEqual(h.calls.filter((call) => call.operation === "invalidate").map((call) => call.args.tag), Array(3).fill("exam-analysis:a"));
      await assert.rejects(h.service.deleteExamImport("a", actor, first.sessionId), /찾을 수 없습니다/);
      assert.deepEqual(h.snapshots(), saved);
    });

    for (const edit of ["score", "notes", "timestamp", "identity", "missing-proof", "bad-proof", "writer"] as const) {
      test(`safe deletion preserves ${edit} ${category} record and counts independent manual record (${mock})`, async () => {
        const h = harness(mock, category);
        const result = await h.service.confirmExamImport("a", actor, files, h.data.selection);
        const table = category === "REGULAR" ? "examScore" : "morningExamScore";
        h.edit((s) => {
          const row = s[table][0];
          if (edit === "score") row[category === "REGULAR" ? "scores" : "score"] = category === "REGULAR" ? { "subject-a": 1 } : 1;
          if (edit === "notes") row.notes = "manual change";
          if (edit === "timestamp") row.updatedAt = "2030-01-01T00:00:00.000Z";
          if (edit === "identity") row.id = "replacement-manual";
          if (edit === "writer") row.recordedById = "super";
          if (edit === "missing-proof") s.examSessionParticipant[0].derivedScoreSnapshot = null;
          if (edit === "bad-proof") s.examSessionParticipant[0].derivedScoreSnapshot = { version: 7 };
          s[table].push({ ...structuredClone(row), id: "independent-manual", ...(category === "REGULAR" ? { examRound: 99 } : { studentId: "student-a-2" }) });
        });
        const preserved = h.snapshots()[table].filter((row) => row.id !== h.snapshots().examSessionParticipant[1].derivedScoreId);
        assert.deepEqual(await h.service.deleteExamImport("a", actor, result.sessionId), { removedStudents: 2, keptManualScores: 2 });
        assert.deepEqual(h.snapshots()[table], preserved);
        assert.equal(h.snapshots().examSession.length, 0);
        assert.equal(h.snapshots().examSessionParticipant.length, 0);
      });
    }
  }

  test(`history and deletion reject assistants and foreign actors/sessions without writes (${mock})`, async () => {
    const h = harness(mock, "REGULAR");
    const result = await h.service.confirmExamImport("a", actor, files, h.data.selection);
    for (const wrong of [{ ...actor, role: "ASSISTANT" as const }, { ...actor, divisionId: "division-b" }]) {
      const before = h.snapshots();
      await assert.rejects(h.service.listExamImports("a", wrong), /권한/);
      await assert.rejects(h.service.deleteExamImport("a", wrong, result.sessionId), /권한/);
      assert.deepEqual(h.snapshots(), before);
    }
    const before = h.snapshots();
    await assert.rejects(h.service.deleteExamImport("b", { ...actor, divisionId: "division-b" }, result.sessionId), /찾을 수 없습니다/);
    assert.deepEqual(h.snapshots(), before);
    assert.equal(h.calls.filter((call) => call.operation === "invalidate").length, 1);
  });
}

for (const category of ["REGULAR", "MORNING"] as const) {
  test(`late ${category} delete failure rolls back children, legacy and session`, async () => {
    const h = harness(false, category);
    const result = await h.service.confirmExamImport("a", actor, files, h.data.selection);
    const before = h.snapshots();
    h.failDelete("examSession");
    await assert.rejects(h.service.deleteExamImport("a", actor, result.sessionId), /injected delete failure/);
    assert.deepEqual(h.snapshots(), before);
    assert.equal(h.calls.filter((call) => call.operation === "invalidate").length, 1);
  });
  test(`concurrent manual ${category} edit after proof read fails conditional deletion`, async () => {
    const h = harness(false, category);
    const result = await h.service.confirmExamImport("a", actor, files, h.data.selection);
    const table = category === "REGULAR" ? "examScore" : "morningExamScore";
    let changed = false;
    h.beforeDelete((target, current) => {
      if (target === table && !changed) {
        current[table][0].notes = "concurrent edit";
        current[table][0].updatedAt = new Date("2030-01-01T00:00:00.000Z");
        changed = true;
      }
    });
    assert.deepEqual(await h.service.deleteExamImport("a", actor, result.sessionId), { removedStudents: 2, keptManualScores: 1 });
    assert.equal(h.snapshots()[table].length, 1);
    assert.equal(h.snapshots()[table][0].notes, "concurrent edit");
  });
}

for (const mock of [true, false]) {
  test(`delete preserves other tenants and morning subjects at the same date (${mock})`, async () => {
    const h = harness(mock, "MORNING");
    const own = await h.service.confirmExamImport("a", actor, files, h.data.selection);
    const foreign = await h.service.confirmExamImport("b", { ...actor, id: "super", role: "SUPER_ADMIN", divisionId: null }, files, { ...h.data.selection, examTypeId: "type-b" });
    h.edit((state) => state.morningExamScore.push({
      ...structuredClone(state.morningExamScore[0]), id: "other-subject", subjectId: "other-subject",
    }));
    const before = h.snapshots();
    assert.deepEqual(await h.service.deleteExamImport("a", actor, own.sessionId), { removedStudents: 2, keptManualScores: 0 });
    const after = h.snapshots();
    assert.deepEqual(after.examSession, before.examSession.filter((row) => row.id === foreign.sessionId));
    for (const table of ["examSessionParticipant", "examSessionItem", "examItemResponse"] as const)
      assert.deepEqual(after[table], before[table].filter((row) => row.divisionId === "division-b"));
    const byId = (a: Row, b: Row) => String(a.id).localeCompare(String(b.id));
    assert.deepEqual(after.morningExamScore.sort(byId), before.morningExamScore.filter((row) => row.examTypeId === "type-b" || row.subjectId === "other-subject").sort(byId));
  });
}


for (const mock of [true, false]) {
  test(`regular import without topic succeeds (${mock})`, async () => {
    const h = harness(mock, "REGULAR");
    const selection: ExamImportSelection = { category: "REGULAR", examTypeId: "type-a" };
    const result = await h.service.confirmExamImport("a", actor, files, selection);
    assert.equal(result.importedCount, 2);
    assert.equal(h.snapshots().examSession[0].topic, null);
    assert.equal(h.snapshots().examSession[0].identityKey, "regular:2026-09-08");
    assert.equal(h.snapshots().examScore.length, 2);
  });

  test(`morning import requires a nonblank topic (${mock})`, async () => {
    for (const topic of [undefined, "", "  "]) {
      const h = harness(mock, "MORNING");
      const before = h.snapshots();
      await assert.rejects(h.service.confirmExamImport("a", actor, files, { ...h.data.selection, topic }), /진도/);
      assert.deepEqual(h.snapshots(), before);
      assert.equal(h.calls.filter((call) => call.operation === "invalidate").length, 0);
    }
  });
}
