import assert from "node:assert/strict";
import test from "node:test";
import { assembleRegularCohort, assembleRegularStudentReport, assembleRegularSessions, selectRegularSessionIds } from "../../lib/exam-analysis-assembler";
import { DEFAULT_EXAM_ANALYSIS_SETTINGS } from "../../lib/exam-analysis-settings";
import type { RegularRawBundle } from "../../lib/exam-analysis-types";

function fixture(): RegularRawBundle {
  const aggregate = { count: 3, mean: 30, distribution: [{ score: 20, count: 1 }, { score: 30, count: 1 }, { score: 40, count: 1 }], top10Avg: 20, top30Avg: 20, top10Count: 1, top30Count: 1, top10Complete: true, top30Complete: true };
  const externalStats = { count: 3, mean: 70, distribution: [{ score: 50, count: 1 }, { score: 80, count: 2 }], subjects: { a: aggregate, b: aggregate, c: aggregate }, regions: { R: { count: 2, mean: 65, distribution: [{ score: 50, count: 1 }, { score: 80, count: 1 }], subjects: null, subjectsComplete: false, unresolvedSubjectRows: 1 } } };
  const session = { id: "now", divisionId: "d", examTypeId: "e", examDate: "2026-09-08", primarySubjectId: null, topic: null, fullScore: 100, itemCount: 2, externalCohortSize: 4, externalStats };
  const participant = { divisionId: "d", sessionId: "now", studentId: "s1", totalScore: 50, subjectScores: { a: 20, c: 30 }, isPartial: false, region: "R", externalRank: 3, externalPercentile: 16.7, regionalRank: 2 };
  return { divisionId: "d", examTypeId: "e", examDate: "2026-09-08", settings: structuredClone(DEFAULT_EXAM_ANALYSIS_SETTINGS),
    examTypes: [{ id: "e", name: "시험", category: "REGULAR", subjects: ["a", "b", "c"].map(id => ({ id, name: id, alternateGroup: id === "c" ? null : "choice", totalItems: 20, pointsPerItem: 999, isActive: false })) }],
    sessions: [session, { ...session, id: "old", examDate: new Date("2026-08-01") }, { ...session, id: "other", examTypeId: "other", examDate: "2026-09-01" }, { ...session, id: "foreign", divisionId: "other", examDate: "2026-09-01" }],
    participants: [participant, { ...participant, studentId: "s2", totalScore: 80, subjectScores: { b: 40, c: 40 } }, { ...participant, sessionId: "old", totalScore: 80 }, { ...participant, sessionId: "old", studentId: "s2", totalScore: 50 }, { ...participant, divisionId: "other", studentId: "foreign", totalScore: 999 }],
    students: [{ id: "s1", divisionId: "d", name: "실명하나", studentNumber: "00123" }, { id: "s2", divisionId: "d", name: "실명둘", studentNumber: "00999" }, { id: "foreign", divisionId: "other", name: "다른직렬", studentNumber: "12345" }],
    items: ["a", "b", "c"].map((subjectId, position) => ({ divisionId: "d", sessionId: "now", subjectId, itemNo: 1, position, answerKey: "1", points: 50, correctRatePct: 80, choiceRates: {}, mostCommonWrong: "2" })),
    responses: [{ divisionId: "d", sessionId: "now", studentId: "s1", subjectId: "a", itemNo: 1, answer: "2", isCorrect: false }, { divisionId: "d", sessionId: "now", studentId: "s1", subjectId: "c", itemNo: 1, answer: null, isCorrect: false }, { divisionId: "d", sessionId: "now", studentId: "s1", subjectId: "b", itemNo: 1, answer: null, isCorrect: false }, { divisionId: "d", sessionId: "now", studentId: "s2", subjectId: "b", itemNo: 1, answer: "1", isCorrect: true }],
    targets: [{ studentId: "s1", examTypeId: "e", targetScore: 90 }] };
}

test("first exam has no previous comparison or decline list and excludes unrelated trend types", () => {
  const bundle = fixture();
  bundle.sessions = bundle.sessions.filter(row => row.id === "now");
  const cohort = assembleRegularCohort(bundle);
  assert.equal(cohort.hasPreviousExam, false);
  assert.deepEqual(cohort.declines, []);
  assert.ok(cohort.ranking.every(row => row.delta === null));
  bundle.trend = [{ id: "foreign-type", examTypeId: "different", examTypeName: "다른 종류", examRound: 1, examDate: "2026-09-08", totalScore: 1, rankInClass: 1, notes: null, subjects: [] }];
  const report = assembleRegularStudentReport(bundle, "s1", { role: "STUDENT", studentId: "s1" });
  assert.equal(report.hasPreviousExam, false);
  assert.deepEqual(report.trend, []);
});

test("historical points, active alternatives, incomplete regional stats and total-ranked subject cohorts", () => {
  const bundle = fixture(), before = structuredClone(bundle);
  const report = assembleRegularStudentReport(bundle, "s1", { role: "STUDENT", studentId: "s1" });
  assert.equal(report.student.name, null); assert.equal(report.student.studentNumber, "00***");
  assert.deepEqual(report.subjects.map(s => s.id), ["a", "b", "c"]);
  assert.deepEqual(report.stats.subjects.map(s => s.subjectId), ["a", "c"]);
  assert.equal(report.subjects.find(s => s.id === "b")?.alternateGroup, "choice");
  assert.equal(report.competitors[0].subjectScores.b, 40);
  assert.equal(report.stats.subjects[0].fullScore, 50);
  assert.equal(report.stats.subjects[0].top10Avg, 20, "do not re-rank each subject for total-ranked top cohort averages");
  assert.equal(report.stats.subjects[0].regionAvg, null);
  assert.equal(report.stats.subjects[0].regionComplete, false);
  assert.equal(report.items.summary.total, 2); assert.equal(report.items.summary.unanswered, 1);
  assert.ok(!report.items.list.some(row => row.subjectId === "b"));
  assert.equal(report.ranks.external.count, 3, "rank denominator is graded rows, not Moon header count");
  assert.equal(report.ranks.external.rank, 3); assert.equal(report.ranks.external.percentile, 16.7);
  assert.equal(report.ranks.region?.percentile, 25);
  assert.equal(report.competitors.length, 1); assert.match(report.competitors[0].studentNumber, /^\d{2}\*+$/);
  assert.ok(!JSON.stringify(report).includes("실명")); assert.ok(!JSON.stringify(report).includes("다른직렬"));
  assert.equal(report.target?.gap, 40); assert.equal(report.target?.gapPercent, 40);
  assert.deepEqual(bundle, before);
});

test("shared previous selector skips other exams/tenants and uses latest earlier date", () => {
  const bundle = fixture();
  assert.deepEqual(selectRegularSessionIds(bundle, "e", "2026-09-08"), { currentId: "now", participantSessionIds: ["now", "old"] });
  const cohort = assembleRegularCohort(bundle);
  assert.equal(cohort.internal.count, 2); assert.equal(cohort.internal.isReliable, false);
  assert.deepEqual(cohort.ranking.find(row => row.studentId === "s1")?.delta, { total: -30, rank: -1 });
  assert.equal(cohort.internal.subjectAverages.a, 20); assert.equal(cohort.internal.subjectAverages.b, 40);
  assert.equal(cohort.classWrongTop.find(row => row.subjectId === "b")?.internalCorrectRatePct, 100, "untaken X excluded");
  assert.deepEqual(assembleRegularSessions(bundle, "e").map(s => [s.examDate, s.participantCount]), [["2026-09-08", 2], ["2026-08-01", 2]]);
});

test("student session list requires owned participation and retains full cohort counts", () => {
  const bundle = fixture();
  bundle.participants = bundle.participants.filter(row => !(row.studentId === "s1" && row.sessionId === "old"));
  assert.deepEqual(assembleRegularSessions(bundle, "e", "s1").map(s => [s.examDate, s.participantCount]), [["2026-09-08", 2]]);
  assert.deepEqual(assembleRegularSessions(bundle, "e", "s2").map(s => [s.examDate, s.participantCount]), [["2026-09-08", 2], ["2026-08-01", 1]]);
  assert.equal(assembleRegularSessions(bundle, "e").length, 2);
  assert.deepEqual(assembleRegularSessions(bundle, "e", "legacy-only"), []);
  assert.deepEqual(assembleRegularSessions(bundle, "e", "foreign"), []);
});

test("partial missing subjects exclude untaken alternative when its sibling was taken", () => {
  const bundle = fixture(); bundle.participants[0].isPartial = true; bundle.participants[0].subjectScores = { a: 0 };
  assert.deepEqual(assembleRegularCohort(bundle).partials[0].missingSubjects, ["c"]);
  bundle.participants[0].subjectScores = { c: 0 };
  assert.deepEqual(assembleRegularCohort(bundle).partials[0].missingSubjects, ["a", "b"]);
  const report = assembleRegularStudentReport(bundle, "s1", { role: "ADMIN" });
  assert.equal(report.items.summary.total, 1); assert.equal(report.myScore.subjectScores.c, 0);
});

test("student authorization rejects missing/mismatched viewer ID and assistants", () => {
  for (const viewer of [{ role: "STUDENT" } as const, { role: "STUDENT", studentId: "s2" } as const, { role: "ASSISTANT" } as const]) {
    assert.throws(() => assembleRegularStudentReport(fixture(), "s1", viewer), (error: unknown) => (error as { status: number }).status === 403);
  }
  assert.throws(() => assembleRegularStudentReport(fixture(), "foreign", { role: "ADMIN" }), /찾을 수 없습니다/);
});

test("unknown aggregate information stays null and settings affect cached-bundle calculations", () => {
  const bundle = fixture(); bundle.sessions[0].externalStats = {};
  const report = assembleRegularStudentReport(bundle, "s1", { role: "ADMIN" });
  assert.equal(report.stats.external.average, null); assert.equal(report.ranks.external.rank, null);
  assert.equal(report.stats.subjects[0].top10Avg, null); assert.equal(report.stats.subjects[0].externalAvg, null);
  assert.ok(report.flags.some(f => f.kind === "totalDrop"));
  bundle.settings.regular.totalDropPercent = 50;
  assert.ok(!assembleRegularStudentReport(bundle, "s1", { role: "ADMIN" }).flags.some(f => f.kind === "totalDrop"));
});

test("histogram counts are weighted without expanding external cohort and clamp highest bin", () => {
  const bundle = fixture(); bundle.sessions[0].externalStats = { distribution: [{ score: 50, count: 1_000_000 }, { score: 100, count: 1_000_000 }] };
  const report = assembleRegularStudentReport(bundle, "s1", { role: "ADMIN" });
  assert.equal(report.stats.external.average, 75); assert.equal(report.stats.external.top10Avg, 100);
  assert.equal(report.ranks.external.rank, 1_000_001); assert.equal(report.ranks.external.percentile, 25);
  assert.equal(report.distribution.bins.at(-1)?.count, 1_000_000);
});

test("student trend explicitly projects safe fields and removes free-text notes", () => {
  const bundle = fixture(); bundle.trend = [{ id: "t", examTypeId: "e", examTypeName: "시험", examRound: 1, examDate: null, totalScore: 80, rankInClass: 1, notes: "다른 학생 실명하나 상담", subjects: [] }];
  assert.equal(assembleRegularStudentReport(bundle, "s1", { role: "STUDENT", studentId: "s1" }).trend[0].notes, null);
  assert.equal(assembleRegularStudentReport(bundle, "s1", { role: "ADMIN" }).trend[0].notes, bundle.trend[0].notes);
  assert.ok(!JSON.stringify(assembleRegularStudentReport(bundle, "s1", { role: "ADMIN" })).includes('"examRound"'));
  assert.equal(bundle.trend[0].examRound, 1, "legacy manual input remains unchanged");
});

test("subject taker count drives grading while internal reliability uses cohort count", () => {
  const bundle = fixture();
  for (let i = 3; i <= 10; i++) {
    bundle.students.push({ id: `s${i}`, divisionId: "d", name: `학생${i}`, studentNumber: `000${i}` });
    bundle.participants.push({ ...bundle.participants[0], studentId: `s${i}` });
  }
  const cohort = assembleRegularCohort(bundle);
  const report = assembleRegularStudentReport(bundle, "s1", { role: "ADMIN" });
  assert.equal(cohort.internal.isReliable, true); assert.equal(report.ranks.internal.count, 10);
  assert.equal(report.stats.subjects[0].externalCount, 3);
  assert.equal(report.stats.subjects[0].gradeBasis, "scoreRate");
  assert.equal(report.ranks.internal.rank, 2, "tied totals share rank");
});

test("empty cohort has nullable aggregates and no fictitious diagnostics; no previous participation means no delta", () => {
  const bundle = fixture(); bundle.participants = bundle.participants.filter(p => p.sessionId === "now");
  assert.equal(assembleRegularCohort(bundle).ranking[0].delta, null);
  bundle.participants = []; bundle.responses = [];
  const cohort = assembleRegularCohort(bundle);
  assert.equal(cohort.internal.average, null); assert.equal(cohort.internal.stdDev, null);
  assert.equal(cohort.internal.count, 0); assert.deepEqual(cohort.classWrongTop, []);
  assert.equal(cohort.internal.subjectAverages.a, null);
});

test("incomplete top cohorts remain null even when misleading fallback values exist", () => {
  const bundle = fixture();
  const stats = bundle.sessions[0].externalStats as { subjects: Record<string, { top10Avg: number | null; top10Complete: boolean }> };
  stats.subjects.a.top10Avg = 0; stats.subjects.a.top10Complete = false;
  const report = assembleRegularStudentReport(bundle, "s1", { role: "ADMIN" });
  assert.equal(report.stats.subjects[0].top10Avg, null);
  assert.equal(report.stats.subjects[0].top10Complete, false);
});

test("date identity selects latest strictly earlier regular date regardless of source order", () => {
  const bundle = fixture(), base = bundle.sessions[0];
  bundle.sessions.push(
    { ...base, id: "future", examDate: "2026-10-01" },
    { ...base, id: "near", examDate: new Date("2026-09-01T00:00:00Z") },
    { ...base, id: "subject-session", examDate: "2026-09-07", primarySubjectId: "a" },
  );
  bundle.sessions.reverse();
  assert.deepEqual(selectRegularSessionIds(bundle, "e", "2026-09-08"), { currentId: "now", participantSessionIds: ["now", "near", "old"] });
  assert.deepEqual(selectRegularSessionIds(bundle, "e", "2026-08-01"), { currentId: "old", participantSessionIds: ["old"] });
  assert.throws(() => selectRegularSessionIds(bundle, "e", "2026-09-07"), /찾을 수 없습니다/);
  assert.throws(() => selectRegularSessionIds(bundle, "e", "3"), /찾을 수 없습니다/);
  const list = assembleRegularSessions(bundle, "e");
  assert.deepEqual(list.map(row => row.examDate), ["2026-10-01", "2026-09-08", "2026-09-01", "2026-08-01"]);
  assert.deepEqual(Object.keys(list[0]).sort(), ["examDate", "participantCount", "sessionId"]);
  assert.equal(assembleRegularCohort(bundle).ranking[0].delta, null, "no fallback to older participation when latest earlier exam was not taken");
});

test("outward external and regional subject averages round to one decimal without mutating raw statistics", () => {
  for (const [raw, expected] of [[28.333333333333332, 28.3], [68.1818, 68.2], [28.2499, 28.2], [28.25, 28.3], [0, 0]]) {
    const bundle = fixture();
    const stats = bundle.sessions[0].externalStats as {
      subjects: Record<string, { count: number; mean: number }>;
      regions: Record<string, { subjectsComplete: boolean; subjects: Record<string, { count: number; mean: number }> | null }>;
    };
    stats.subjects.a.mean = raw;
    stats.regions.R.subjectsComplete = true;
    stats.regions.R.subjects = { a: { count: 2, mean: raw } };
    const before = structuredClone(bundle);
    assert.equal(assembleRegularCohort(bundle).external.subjectAverages.a, expected);
    const report = assembleRegularStudentReport(bundle, "s1", { role: "ADMIN" });
    assert.equal(report.stats.subjects[0].externalAvg, expected);
    assert.equal(report.stats.subjects[0].regionAvg, expected);
    assert.deepEqual(bundle, before);
  }
});

test('personal six-month history excludes future, old and foreign records without deleting history', () => {
 const b=fixture();
 for (const [id,examDate] of [['early','2026-04-01'],['too-old','2026-03-31'],['future','2026-09-09']] as const) {
  b.sessions.push({...b.sessions[0],id,examDate}); b.participants.push({...b.participants[0],sessionId:id,totalScore:0});
 }
 const report=assembleRegularStudentReport(b,'s1',{role:'STUDENT',studentId:'s1'});
 assert.equal(report.history?.from,'2026-04-01');
 assert.deepEqual(report.history?.rows.map(r=>r.date),['2026-04-01','2026-08-01','2026-09-08']);
 assert.equal(report.history?.coveredMonths,3); assert.equal(report.history?.rows[0].total,0);
 assert.equal(report.history?.months.length,6);
 assert.ok(!JSON.stringify(report.history).includes('실명둘'));
 assert.ok(b.sessions.some(s=>s.id==='too-old'));
 assert.ok(selectRegularSessionIds(b,'e','2026-09-08').participantSessionIds.includes('early'));
});

test("student history external rank is owned, division scoped, and distinct from class rank", () => {
 const bundle=fixture();
 bundle.participants[0].externalRank=57;
 bundle.participants[0].derivedScoreId="owned-derived";
 bundle.participants.push({...bundle.participants[0],divisionId:"other",externalRank:999});
 const rows=assembleRegularSessions(bundle,"e","s1");
 assert.equal(rows.find(row=>row.sessionId==="now")?.externalRank,57);
 assert.equal(rows.find(row=>row.sessionId==="now")?.importedScore?.id,"owned-derived");
 assert.deepEqual(rows.find(row=>row.sessionId==="now")?.importedScore?.subjects,bundle.participants[0].subjectScores);
 assert.equal(assembleRegularSessions(bundle,"e")[0].externalRank,undefined);
 assert.equal(assembleRegularSessions(bundle,"e")[0].importedScore,undefined);
 bundle.participants[0].externalRank=null;
 assert.equal(assembleRegularSessions(bundle,"e","s1").find(row=>row.sessionId==="now")?.externalRank,null);
 assert.deepEqual(assembleRegularSessions(bundle,"e","missing"),[]);
});
