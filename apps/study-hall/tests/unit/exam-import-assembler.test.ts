import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseExamImportPair, type ParsedExamImport } from "../../lib/exam-import-parser";
import { assembleExamImport, type ImportExamType, type ImportStudent } from "../../lib/exam-import-assembler";

function setup(category: "REGULAR" | "MORNING" = "REGULAR") {
  const prefix = category === "REGULAR" ? "regular" : "morning-synthetic";
  const read = (suffix: string) => readFileSync(path.join(process.cwd(), "tests/fixtures/exam-import", `${prefix}-${suffix}.xls`));
  const parsed = parseExamImportPair(read("score"), read("moon"));
  const names = Array.from(new Set(parsed.moon.map(item => item.subjectName)));
  const examType: ImportExamType = {
    id: "fixture-exam", name: "Fixture exam", category, isActive: true,
    subjects: names.map((name, index) => ({
      id: `subject-${index}`, name, totalItems: parsed.moon.filter(item => item.subjectName === name).length,
      pointsPerItem: category === "REGULAR" ? 2.5 : 5,
      alternateGroup: category === "REGULAR" && index < 2 ? names.slice(0, 2).join("/") : null,
      isActive: true,
    })),
  };
  const students: ImportStudent[] = parsed.score.map((row, index) => ({ id: `internal-${index}`, studentNumber: row.studentNumber, name: `Internal student ${index}` }));
  const run = (input: ParsedExamImport = parsed, roster: ImportStudent[] = students, types = [examType]) => assembleExamImport(input, types, roster, { category, examTypeId: examType.id });
  return { parsed, examType, students, run };
}

test("regular fixture reconstructs 250-point exam with ten complete participants and all subject scores", () => {
  const { parsed, examType, run } = setup(); const result = run();
  assert.equal(result.preview.canConfirm, true);
  assert.deepEqual(result.preview.errors, []);
  assert.equal(result.preview.fullScore, 250);
  assert.equal(result.preview.itemCount, 100);
  assert.equal(result.items.length, 120);
  assert.equal(result.preview.reproduction.matchedCount, 10);
  assert.deepEqual(result.preview.reproduction.mismatches, []);
  assert.deepEqual(result.preview.matching, { matched: 12, unmatched: 0, invalid: 0 });
  assert.equal(result.participants.length, 11);
  for (const participant of result.participants) {
    const index = Number(participant.studentId.replace("internal-", ""));
    const source = parsed.score[index];
    assert.equal(participant.totalScore, source.scores["총점"]);
    for (const [id, score] of Object.entries(participant.subjectScores)) {
      const subject = examType.subjects.find(item => item.id === id)!;
      const column = Object.keys(source.scores).find(name => name.split("/").includes(subject.name))!;
      assert.equal(score, source.scores[column]);
    }
  }
  assert.ok(result.items.every(item => item.points === 2.5));
  assert.deepEqual(result.items.map(item => item.position).sort((a,b) => a-b), Array.from({ length: 120 }, (_,i) => i+1));
});

test("wrong configured points block confirmation through reproduction mismatches", () => {
  const { examType, run } = setup(); examType.subjects[0].pointsPerItem = 5;
  const result = run();
  assert.equal(result.preview.canConfirm, false);
  assert.equal(result.preview.fullScore, 300);
  const subjectMismatches = result.preview.reproduction.mismatches.filter(row => row.subjectName === examType.subjects[0].name);
  assert.equal(subjectMismatches.length, 6);
  assert.ok(subjectMismatches.every(row => row.actual === row.expected! * 2));
});

test("six malformed identifiers are skipped and reported only by source row", () => {
  const { parsed, run } = setup();
  const badIds = ["", "", "", "", "1234", "12"];
  badIds.forEach((id,index) => { parsed.score[index].studentNumber = id; parsed.errata[index].studentNumber = id; });
  const result = run();
  assert.deepEqual(result.preview.matching, { matched: 6, unmatched: 0, invalid: 6 });
  assert.deepEqual(result.preview.invalidRows.map(row => row.sourceRow), [2,3,4,5,6,7]);
  assert.ok(result.preview.invalidRows.every(row => Object.keys(row).sort().join(",") === "reason,sourceRow"));
  assert.equal(result.participants.length, 5);
  assert.equal(result.preview.reproduction.matchedCount, 4);
  assert.equal(result.preview.canConfirm, true);
});

test("unanswered alternate blocks never become wrong responses; partial and absent differ", () => {
  const { run } = setup(); const result = run();
  assert.deepEqual(result.preview.partialRows.map(row => ({ sourceRow: row.sourceRow, absent: row.absent })), [{ sourceRow: 12, absent: false }, { sourceRow: 13, absent: true }]);
  for (let index=0; index<10; index++) {
    const participant = result.participants.find(row => row.studentId === `internal-${index}`)!;
    assert.equal(participant.responses.length, 100);
    assert.equal(participant.isPartial, false);
    const omitted = index < 6 ? "subject-1" : "subject-0";
    assert.ok(!(omitted in participant.subjectScores));
    assert.ok(participant.responses.every(row => row.subjectId !== omitted));
  }
  const partial = result.participants.find(row => row.studentId === "internal-10")!;
  assert.equal(partial.isPartial, true); assert.equal(partial.responses.length, 80);
  assert.equal(result.participants.some(row => row.studentId === "internal-11"), false);
});

test("synthetic morning creates 100-point single-subject scores and trusts marks with multiselect", () => {
  const { run } = setup("MORNING"); const result = run();
  assert.equal(result.preview.canConfirm, true); assert.equal(result.preview.fullScore, 100);
  assert.equal(result.preview.itemCount, 20); assert.equal(result.items.length, 20);
  assert.equal(result.primarySubjectId, "subject-0"); assert.equal(result.preview.reproduction.matchedCount, 8);
  assert.equal(result.participants.length, 8);
  for (const row of result.participants) {
    assert.equal(row.totalScore, 90); assert.equal(row.responses.length, 20);
    assert.deepEqual(row.responses[0], { subjectId: "subject-0", itemNo: 1, answer: "2,4", isCorrect: false });
    assert.equal(row.responses[1].answer, null);
  }
});

test("external aggregation contains no student identifiers or names and unmatched rows stay anonymous", () => {
  const { parsed, students, run } = setup();
  // Adversarial properties must not be spread through this boundary even if a caller adds them.
  const privateRow = parsed.score[10] as typeof parsed.score[number] & { name: string; dob: string };
  privateRow.name = "EXTERNAL_PRIVATE_SENTINEL"; privateRow.dob = "1987-03-19";
  const roster = students.slice(0, 2); const result = run(parsed, roster);
  assert.equal(result.preview.canConfirm, true); assert.equal(result.participants.length, 2);
  assert.deepEqual(result.preview.matching, { matched: 2, unmatched: 10, invalid: 0 });
  assert.ok(result.preview.partialRows.every(row => row.studentName === null));
  assert.equal(result.externalStats.count, 12);
  assert.equal(result.externalStats.distribution.reduce((sum,bin) => sum+bin.count,0), 12);
  const totals = parsed.score.map(row => row.scores["총점"]!);
  assert.equal(result.externalStats.mean, totals.reduce((sum,n) => sum+n,0)/totals.length);
  const json = JSON.stringify(result); const stats = JSON.stringify(result.externalStats);
  for (const secret of [privateRow.name, privateRow.dob, ...parsed.score.map(row => row.studentNumber)]) assert.ok(!json.includes(secret));
  for (const student of students) { assert.ok(!stats.includes(student.name)); assert.ok(!stats.includes(student.id)); }
  assert.deepEqual(Object.keys(result.externalStats).sort(), ["count", "distribution", "mean", "regions", "subjects"]);
});

test("independent Errata row order does not change assembled participants", () => {
  const { parsed, run } = setup(); const expected = run(); parsed.errata.reverse();
  assert.deepEqual(run().participants, expected.participants);
});

for (const location of ["score", "errata", "roster"] as const) test(`duplicate ${location} identifiers block confirmation`, () => {
  const { parsed, students, run } = setup();
  if (location === "roster") students[1].studentNumber = students[0].studentNumber;
  else parsed[location][1].studentNumber = parsed[location][0].studentNumber;
  const result = run(); assert.equal(result.preview.canConfirm, false);
  assert.ok(result.preview.errors.some(message => message.includes("중복")));
});

test("both alternate subjects answered block confirmation", () => {
  const { parsed, run } = setup(); parsed.errata[0].blocks[1].answers[0] = "1";
  const result = run(); assert.equal(result.preview.canConfirm, false);
  assert.ok(result.preview.errors.some(message => message.includes("택1")));
});

test("missing Errata for a valid Score ID blocks confirmation", () => {
  const { parsed, run } = setup(); parsed.errata[1].studentNumber = "99999";
  const result = run(); assert.equal(result.preview.canConfirm, false);
  assert.ok(result.preview.errors.some(message => message.includes("응답이 없습니다")));
});

test("selected exam with wrong item count or incomplete subject set is rejected", () => {
  const { examType, run } = setup(); examType.subjects[0].totalItems = 19;
  assert.equal(run().preview.canConfirm, false);
  examType.subjects.splice(0,1); assert.equal(run().preview.canConfirm, false);
});

test("corrupted Score total cannot pass successful subject reproduction", () => {
  const { parsed, run } = setup(); parsed.score[0].scores["총점"]! += 2.5;
  const result = run(); assert.equal(result.preview.canConfirm, false, "A mismatching published total must block import.");
});

test("absent participant with nonzero published total blocks confirmation", () => {
  const { parsed, run } = setup(); parsed.score[11].scores["총점"] = 2.5;
  const result = run();
  assert.equal(result.preview.canConfirm, false);
  assert.ok(result.preview.reproduction.mismatches.some(row => row.sourceRow === 13 && row.actual === 0 && row.expected === 2.5));
});

test("external file-cohort aggregates retain malformed identifiers and absent zero scores", () => {
  const { parsed, run } = setup(); parsed.score[0].studentNumber = "12"; parsed.errata[0].studentNumber = "12";
  const result = run(); const totals = parsed.score.map(row => row.scores["총점"]!);
  assert.equal(result.preview.matching.invalid, 1);
  assert.equal(result.externalStats.count, parsed.meta.cohortSize);
  assert.equal(result.externalStats.mean, totals.reduce((sum,n) => sum+n,0)/totals.length);
  assert.equal(result.externalStats.distribution.reduce((sum,bin) => sum+bin.count,0), parsed.meta.cohortSize);
  for (const [region, stat] of Object.entries(result.externalStats.regions)) {
    const scores = parsed.score.filter(row => row.region === region).map(row => row.scores["총점"]!);
    assert.equal(stat.count, scores.length); assert.equal(stat.mean, scores.reduce((sum,n) => sum+n,0)/scores.length);
  }
  for (const participant of result.participants) {
    assert.equal(participant.externalRank, 1+totals.filter(n => n>participant.totalScore).length);
    assert.equal(participant.externalPercentile, 100*(totals.filter(n => n<participant.totalScore).length+0.5*totals.filter(n => n===participant.totalScore).length)/totals.length);
  }
});

test("unanswered required subject with positive Score blocks confirmation even with null total", () => {
  const { parsed, run } = setup();
  const block = parsed.errata[0].blocks[2];
  block.answers.fill(null);
  block.marks.fill("X");
  parsed.score[0].scores["총점"] = null;
  parsed.score[0].scores["형사법"] = 90;
  const result = run();
  assert.equal(result.preview.canConfirm, false);
  assert.ok(result.preview.reproduction.mismatches.some(row =>
    row.sourceRow === parsed.score[0].sourceRow && row.subjectName === "형사법" && row.expected === 90 && row.actual === 0,
  ));
});

test("invalid identifier in both source sheets leaves every external subject count and mean unchanged", () => {
  const { parsed, run } = setup();
  const baseline = run();
  assert.ok(Object.keys(baseline.externalStats.subjects).length > 0);
  parsed.score[0].studentNumber = "12";
  parsed.errata[0].studentNumber = "12";
  const result = run();
  assert.equal(result.preview.matching.invalid, 1);
  assert.equal(result.participants.length, baseline.participants.length - 1);
  assert.deepEqual(result.externalStats.subjects, baseline.externalStats.subjects);
});

// Deliberately invert total and subject rankings; a subject-only top sort is wrong.
function aggregateFixture() {
  const fixture = setup();
  fixture.parsed.errata.forEach((row, index) => {
    row.blocks.forEach((block, blockIndex) => {
      const correct = index === 6 ? (blockIndex === 1 ? 20 : blockIndex >= 2 ? 40 : 0)
        : index === 0 && blockIndex >= 2 ? 40
        : index === 1 && blockIndex === 0 ? 20 : 0;
      block.marks = block.marks.map((_, item) => item < correct ? "O" : "X");
    });
    const score = fixture.parsed.score[index];
    score.region = [0, 6, 11].includes(index) ? "A" : "B";
    score.scores = {
      "헌법/범죄학": index === 1 || index === 6 ? 50 : 0,
      "형사법": index === 0 || index === 6 ? 100 : 0,
      "경찰학": index === 0 || index === 6 ? 100 : 0,
      "총점": index === 6 ? 250 : index === 0 ? 200 : index === 1 ? 50 : 0,
    };
  });
  return fixture;
}

test("exact subject and regional histograms retain zero takers and exclude untaken X blocks", () => {
  const { run } = aggregateFixture();
  const result = run(), stats = result.externalStats;
  assert.equal(result.preview.canConfirm, true);
  assert.deepEqual(stats.distribution, [{score:0,count:9},{score:50,count:1},{score:200,count:1},{score:250,count:1}]);
  assert.deepEqual(stats.subjects["subject-0"].distribution, [{score:0,count:5},{score:50,count:1}]);
  assert.deepEqual(stats.subjects["subject-1"].distribution, [{score:0,count:3},{score:50,count:1}]);
  for (const id of ["subject-2", "subject-3"])
    assert.deepEqual(stats.subjects[id].distribution, [{score:0,count:9},{score:100,count:2}]);
  assert.deepEqual(stats.regions.A.distribution, [{score:0,count:1},{score:200,count:1},{score:250,count:1}]);
  assert.equal(stats.regions.A.count, 3); // includes absentee
  assert.equal(stats.regions.A.subjectsComplete, true);
  assert.equal(stats.regions.A.unresolvedSubjectRows, 0);
  assert.deepEqual(stats.regions.A.subjects!["subject-0"].distribution, [{score:0,count:1}]);
  assert.equal(stats.regions.A.subjects!["subject-2"].count, 2);
  for (const stat of Object.values(stats.subjects))
    assert.equal(stat.distribution.reduce((sum, bin) => sum + bin.count, 0), stat.count);
  for (const region of Object.values(stats.regions)) {
    assert.equal(region.distribution.reduce((sum, bin) => sum + bin.count, 0), region.count);
    for (const stat of Object.values(region.subjects!))
      assert.equal(stat.distribution.reduce((sum, bin) => sum + bin.count, 0), stat.count);
  }
});

test("top subject averages use total-ranked ceil cohorts and their own participation denominators", () => {
  const { parsed, run } = aggregateFixture();
  const expected = run().externalStats;
  const constitution = expected.subjects["subject-0"];
  assert.equal(constitution.top10Avg, 0);
  assert.equal(constitution.top10Count, 1);
  assert.equal(constitution.top30Avg, 16.7);
  assert.equal(constitution.top30Count, 3);
  assert.equal(constitution.top10Complete, true);
  assert.equal(constitution.top30Complete, true);
  assert.equal(expected.subjects["subject-1"].top30Avg, 50);
  assert.equal(expected.subjects["subject-2"].top30Avg, 50);
  const regional = expected.regions.A.subjects!["subject-0"];
  assert.equal(regional.top10Avg, null); // top regional student took the alternate
  assert.equal(regional.top10Count, 0);
  assert.equal(regional.top10Complete, true);
  parsed.errata.reverse();
  assert.deepEqual(run().externalStats, expected);
});

test("six malformed IDs retain all global histograms; blank linkage is explicitly incomplete without blocking import", () => {
  const { parsed, run } = aggregateFixture();
  const baseline = run().externalStats;
  ["", "", "", "", "1234", "12"].forEach((id, index) => {
    parsed.score[index].studentNumber = id;
    parsed.errata[index].studentNumber = id;
  });
  const result = run(), stats = result.externalStats;
  assert.equal(result.preview.canConfirm, true);
  assert.equal(result.preview.matching.invalid, 6);
  assert.equal(stats.count, 12);
  assert.deepEqual(stats.distribution, baseline.distribution);
  for (const [id, stat] of Object.entries(stats.subjects)) {
    assert.equal(stat.count, baseline.subjects[id].count);
    assert.equal(stat.mean, baseline.subjects[id].mean);
    assert.deepEqual(stat.distribution, baseline.subjects[id].distribution);
    assert.equal(stat.top10Complete, false);
    assert.equal(stat.top30Complete, false);
    assert.equal(stat.top10Avg, null);
    assert.equal(stat.top30Avg, null);
    assert.equal(stat.top10Count, null);
  }
  for (const [region, stat] of Object.entries(stats.regions)) {
    assert.deepEqual(stat.distribution, baseline.regions[region].distribution);
    assert.equal(stat.subjectsComplete, false);
    assert.equal(stat.subjects, null);
  }
  assert.equal(stats.regions.A.unresolvedSubjectRows, 1);
  assert.equal(stats.regions.B.unresolvedSubjectRows, 3);
  parsed.errata.reverse();
  assert.deepEqual(run().externalStats, stats);
});

test("unique malformed identifiers associate safely while duplicate malformed IDs never associate by position", () => {
  const { parsed, run } = aggregateFixture();
  const baseline = run().externalStats;
  parsed.score[0].studentNumber = parsed.errata[0].studentNumber = "12";
  parsed.errata.reverse();
  assert.deepEqual(run().externalStats, baseline);
  const id = parsed.score[1].studentNumber;
  parsed.score[1].studentNumber = "12";
  parsed.errata.find(row => row.studentNumber === id)!.studentNumber = "12";
  const result = run();
  assert.equal(result.preview.canConfirm, true);
  assert.equal(result.externalStats.regions.A.subjects, null);
  assert.equal(result.externalStats.regions.B.subjects, null);
  assert.deepEqual(result.externalStats.subjects["subject-0"].distribution, baseline.subjects["subject-0"].distribution);
});

test("unresolved low-score identity leaves unaffected top cohorts and other regions exact", () => {
  const { parsed, run } = aggregateFixture();
  const baseline = run().externalStats;
  parsed.score[10].studentNumber = parsed.errata[10].studentNumber = "";
  const stats = run().externalStats;
  assert.deepEqual(stats.subjects, baseline.subjects);
  assert.deepEqual(stats.regions.A, baseline.regions.A);
  assert.equal(stats.regions.B.subjects, null);
  assert.equal(stats.regions.B.unresolvedSubjectRows, 1);
});
