import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { assembleExamImport, type ImportExamType } from "../../lib/exam-import-assembler";
import { parseExamImportPair, ExamImportParseError } from "../../lib/exam-import-parser";
import { morningObjectiveFixture } from "../helpers/morning-objective-fixture";

const selection = { category: "MORNING" as const, examTypeId: "type" };
const type: ImportExamType = { id: "type", name: "Morning", category: "MORNING", isActive: true,
  subjects: [{ id: "subject", name: "Subject", totalItems: 20, pointsPerItem: 5, isActive: true }] };
function parse(fixture = morningObjectiveFixture()) {
  const files = fixture.files();
  return parseExamImportPair(files.scoreBuffer, files.analysisBuffer, selection);
}
function assemble(fixture = morningObjectiveFixture()) {
  const parsed = parse(fixture);
  return assembleExamImport(parsed, [type], parsed.score.map((row, i) => ({
    id: `student-${i}`, name: `Mock ${i}`, studentNumber: row.studentNumber,
  })), selection);
}

test("morning reads only the objective Score column and first 20-item Errata block", () => {
  const parsed = parse();
  assert.deepEqual(parsed.score.map((row) => row.scores), [{ 객관식: 90 }, { 객관식: 50 }, { 객관식: 0 }]);
  assert.equal(parsed.moon.length, 20);
  assert.deepEqual(parsed.errata.map((row) => row.blocks.map((block) => block.itemNumbers.length)), [[20], [20], [20]]);
  assert.ok(!/PRIVATE_NAME_SENTINEL|1999-12-31|주관식/.test(JSON.stringify(parsed)));
});

test("O/X cannot affect saved scores, item counts, rank, distribution or objective absence", () => {
  const result = assemble();
  assert.equal(result.preview.canConfirm, true);
  assert.equal(result.preview.itemCount, 20);
  assert.equal(result.preview.fullScore, 100);
  assert.equal(result.items.length, 20);
  assert.deepEqual(result.participants.map((row) => [row.totalScore, row.responses.length, row.externalRank]), [[90, 20, 1], [50, 20, 2]]);
  assert.deepEqual(result.externalStats.distribution, [{ score: 0, count: 1 }, { score: 50, count: 1 }, { score: 90, count: 1 }]);
  assert.deepEqual(result.preview.partialRows.map((row) => row.absent), [true]);
});

test("ignored O/X scores, keys, answers and marks are neither parsed nor validated", () => {
  const fixture = morningObjectiveFixture();
  for (const row of fixture.score.slice(1)) row[6] = "PRIVATE_IGNORED_SENTINEL";
  for (const row of fixture.errata.slice(1)) row.fill("PRIVATE_IGNORED_SENTINEL", 25);
  assert.deepEqual(assemble(fixture), assemble());
});

test("the default and regular parser still reject unmatched extra blocks", () => {
  const files = morningObjectiveFixture().files();
  for (const options of [undefined, { category: "REGULAR" as const }])
    assert.throws(() => parseExamImportPair(files.scoreBuffer, files.analysisBuffer, options),
      (error: unknown) => error instanceof ExamImportParseError && error.code === "AMBIGUOUS_BLOCK_MAPPING");
});

for (const [kind, row, value, code] of [
  ["marks", 3, "PRIVATE_SENTINEL", "INVALID_MARK"],
  ["keys", 4, "99", "INCONSISTENT_KEYS"],
] as const) test(`objective ${kind} remain strictly validated`, () => {
  const fixture = morningObjectiveFixture(); fixture.errata[row][5] = value;
  assert.throws(() => parse(fixture), (error: unknown) => {
    assert.ok(error instanceof ExamImportParseError); assert.equal(error.code, code);
    assert.ok(!error.message.includes("PRIVATE_SENTINEL")); return true;
  });
});

test("objective score mismatches still prevent confirmation", () => {
  const fixture = morningObjectiveFixture(); fixture.score[1][5] = 95;
  const result = assemble(fixture);
  assert.equal(result.preview.canConfirm, false);
  assert.ok(result.preview.reproduction.mismatches.length > 0);
});

test("morning cannot substitute the O/X score when the objective header is missing", () => {
  const fixture = morningObjectiveFixture(); fixture.score[0][5] = "다른점수";
  assert.throws(() => parse(fixture), (error: unknown) =>
    error instanceof ExamImportParseError && error.code === "DUPLICATE_OR_MISSING_HEADER");
});

test("existing morning exports with blank template padding still parse", () => {
  const read = (suffix: string) => readFileSync(`tests/fixtures/exam-import/morning-synthetic-${suffix}.xls`);
  const parsed = parseExamImportPair(read("score"), read("moon"), selection);
  assert.equal(parsed.moon.length, 20);
  assert.ok(parsed.errata.every((row) => row.blocks.length === 1 && row.blocks[0].marks.length === 20));
});
