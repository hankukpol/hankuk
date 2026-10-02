import assert from "node:assert/strict";
import test from "node:test";
import { isBelowFailCutoff, morningCohortRisk, morningHeadline, regularCohortRisk, regularHeadline, subjectVerdict, weekLabel, weekStart, weeklyScoreGrid, type RegularHeadlineInput } from "../../lib/exam-preview/report-summary";
import { assembleRegularStudentReport } from "../../lib/exam-analysis-assembler";
import { DEFAULT_EXAM_ANALYSIS_SETTINGS, normalizeExamAnalysisSettings, examAnalysisSettingsSchema } from "../../lib/exam-analysis-settings";

test("과락은 만점 대비 기준 미만일 때만이고, 경계 점수는 과락이 아니다", () => {
  assert.equal(isBelowFailCutoff(39.9, 100, 40), true);
  assert.equal(isBelowFailCutoff(40, 100, 40), false, "정확히 40%는 통과");
  // 부동소수: 250 × 37.5% = 93.75, 0.1 단위 배점 합산 오차도 경계에서 떨어뜨리지 않는다.
  assert.equal(isBelowFailCutoff(93.75, 250, 37.5), false);
  assert.equal(isBelowFailCutoff(0.1 + 0.2, 0.75, 40), false);
  assert.equal(isBelowFailCutoff(0, 100, 0), false, "기준 0은 과락을 쓰지 않는다");
  assert.equal(isBelowFailCutoff(10, 0, 40), null, "만점을 모르면 판정 불가");
  assert.equal(isBelowFailCutoff(Number.NaN, 100, 40), null);
});

test("과목 판정은 과락이 먼저이고 아니면 기존 등급을 그대로 쓴다", () => {
  assert.equal(subjectVerdict({ my: 30, fullScore: 100, grade: "우수" }, 40), "과락");
  assert.equal(subjectVerdict({ my: 70, fullScore: 100, grade: "취약" }, 40), "취약");
  assert.equal(subjectVerdict({ my: 30, fullScore: 100, grade: "취약" }, 0), "취약", "기준 0이면 과락 없이 기존 등급");
  assert.equal(subjectVerdict({ my: 30, fullScore: 0, grade: "보통" }, 40), "판정 불가");
});

const base: RegularHeadlineInput = {
  total: 240, fullScore: 300, isPartial: false, rank: 4, count: 12, topPercent: 33.3,
  subjects: [
    { name: "헌법", my: 90, fullScore: 100, grade: "우수" },
    { name: "형사법", my: 80, fullScore: 100, grade: "보통" },
    { name: "경찰학", my: 70, fullScore: 100, grade: "취약" },
  ],
  failCutoffPercent: 40, easyWrong: 3, repeatedTopic: "기본 원리", wrong: 6, declining: false,
};

test("한 줄 결론: 총점·석차·과락·최대 손실 과목·할 일 순서", () => {
  const h = regularHeadline(base);
  assert.equal(h.text, "총점 240/300점 · 12명 중 4위(상위 33.3%) · 과락 없음 · 경찰학에서 30점을 가장 많이 잃었습니다. 많이 맞힌 문제 중 틀린 3문항부터 다시 보세요.");
  assert.equal(h.tone, "info");
  assert.deepEqual(h.failed, []);
});

test("한 줄 결론: 과락이 있으면 과목을 적고 위험 톤이다", () => {
  const h = regularHeadline({ ...base, subjects: [{ name: "헌법", my: 30, fullScore: 100, grade: "취약" }, { name: "형사법", my: 35, fullScore: 100, grade: "취약" }] });
  assert.match(h.text, /과락 헌법, 형사법/);
  assert.equal(h.tone, "danger");
  assert.deepEqual(h.failed, ["헌법", "형사법"]);
  assert.match(h.text, /헌법에서 70점을/, "같은 순서에서 손실이 가장 큰 과목");
});

test("한 줄 결론: 할 일은 쉬운 문제 → 반복 오답 진도 → 남은 오답 순으로 하나만", () => {
  assert.match(regularHeadline({ ...base, easyWrong: 0 }).text, /기본 원리 반복 오답을 복습하세요\.$/);
  assert.match(regularHeadline({ ...base, easyWrong: 0, repeatedTopic: null }).text, /틀린 6문항을 다시 풀어 보세요\.$/);
  assert.match(regularHeadline({ ...base, easyWrong: 0, repeatedTopic: null, wrong: 0 }).text, /잃었습니다\.$/);
});

test("한 줄 결론: 값이 없는 조각은 빼고, 과락 기준 0이면 과락 문구를 쓰지 않는다", () => {
  const h = regularHeadline({ ...base, rank: null, failCutoffPercent: 0, isPartial: true, subjects: [{ name: "헌법", my: 100, fullScore: 100, grade: "우수" }], easyWrong: 0, repeatedTopic: null, wrong: 0 });
  assert.equal(h.text, "총점 240/300점(부분 응시).");
  assert.equal(regularHeadline({ ...base, declining: true }).tone, "warning");
  // 같은 손실이면 화면 순서가 앞선 과목
  assert.match(regularHeadline({ ...base, subjects: [{ name: "가", my: 80, fullScore: 100, grade: "보통" }, { name: "나", my: 80, fullScore: 100, grade: "보통" }] }).text, /가에서 20점/);
});

test("과락 기준 설정: 기본 40, 저장값이 없거나 범위를 벗어나면 기본으로 돌아간다", () => {
  assert.equal(DEFAULT_EXAM_ANALYSIS_SETTINGS.common.failCutoffPercent, 40);
  assert.equal(normalizeExamAnalysisSettings({}).common.failCutoffPercent, 40, "기존 학원(설정 저장 전)은 기본값");
  assert.equal(normalizeExamAnalysisSettings({ common: { failCutoffPercent: 0 } }).common.failCutoffPercent, 0);
  assert.equal(normalizeExamAnalysisSettings({ common: { failCutoffPercent: 120 } }).common.failCutoffPercent, 40);
  assert.equal(examAnalysisSettingsSchema.safeParse({ ...DEFAULT_EXAM_ANALYSIS_SETTINGS, common: { ...DEFAULT_EXAM_ANALYSIS_SETTINGS.common, failCutoffPercent: -1 } }).success, false);
});

test("주 시작은 월요일이고 일요일은 앞 주에 속한다", () => {
  assert.equal(weekStart("2026-09-21"), "2026-09-21"); // 월
  assert.equal(weekStart("2026-09-25"), "2026-09-21"); // 금
  assert.equal(weekStart("2026-09-27"), "2026-09-21"); // 일
  assert.equal(weekStart("2026-09-28"), "2026-09-28");
  assert.equal(weekStart("2026-01-01"), "2025-12-29", "연도를 넘는 주");
  assert.equal(weekLabel("2026-09-21"), "9/21 주");
});

const names: Record<string, string> = { a: "헌법", b: "형소법", c: "형법", d: "누적" };
const row = (date: string, subjectId: string, my: number | null, external: number | null = 60) => ({ date, subjectId, subjectName: names[subjectId], my, fullScore: 100, external });
const subjects = [{ id: "a", name: "헌법" }, { id: "b", name: "형소법" }, { id: "c", name: "형법" }, { id: "d", name: "누적" }];

test("주간 성적표: 과목 순서 그대로, 최근 주만, 결시와 시험 없음을 구분", () => {
  const rows = [row("2026-09-07", "a", 70), row("2026-09-14", "a", 80), row("2026-09-15", "b", null), row("2026-09-21", "a", 90), row("2026-09-22", "b", 75), row("2026-09-23", "c", 35)];
  const grid = weeklyScoreGrid(rows, subjects, 40, 2);
  assert.deepEqual(grid.weeks, ["2026-09-14", "2026-09-21"], "최근 2주");
  assert.deepEqual(grid.rows.map((r) => r.name), ["헌법", "형소법", "형법", "누적"], "템플릿 순서");
  assert.deepEqual(grid.rows[0].cells.map((c) => c?.my), [80, 90]);
  assert.deepEqual(grid.rows[1].cells[0], { my: null, fullScore: 100, below: false }, "시험은 있었고 내 점수 없음 = 결시");
  assert.equal(grid.rows[2].cells[0], null, "그 주에 시험 없음");
  assert.equal(grid.rows[2].cells[1]?.below, true, "과락선 미만");
  assert.deepEqual(grid.rows[3].cells, [null, null], "점수를 가져오지 않는 과목은 빈칸");
  assert.equal(grid.rows[0].average, 80, "평균은 조회 기간 전체(70·80·90)");
  assert.equal(grid.rows[0].gap, 20);
  assert.deepEqual([grid.rows[1].attended, grid.rows[1].expected], [1, 2]);
});

test("아침 한 줄 결론: 최근 주 평균·하락·과락선 미만·할 일", () => {
  const rows = [row("2026-09-14", "a", 80), row("2026-09-21", "a", 90), row("2026-09-22", "b", 70), row("2026-09-23", "c", 35)];
  const h = morningHeadline({ rows, failCutoffPercent: 40, declining: ["형법"], easyWrong: 4, wrong: 9 });
  assert.equal(h.text, "최근 주(9/21 주) 3회 평균 65점(시험 응시자 평균 대비 +5점) · 형법 하락 추세 · 과락선 미만 1회(형법). 많이 맞힌 문제 중 틀린 4문항부터 다시 보세요.");
  assert.equal(h.tone, "danger", "이번 주 과락선 미만이 있으면 위험");
  assert.deepEqual(h.failed, ["형법"]);
  assert.equal(morningHeadline({ rows: rows.slice(0, 3), failCutoffPercent: 40, declining: ["헌법"], easyWrong: 0, wrong: 2 }).tone, "warning");
  assert.equal(morningHeadline({ rows: [], failCutoffPercent: 40, declining: [], easyWrong: 0, wrong: 0 }).text, "조회 기간에 가져온 아침 모의고사 성적이 없습니다.");
  assert.equal(morningHeadline({ rows: [row("2026-09-21", "a", null)], failCutoffPercent: 40, declining: [], easyWrong: 0, wrong: 0 }).text, "최근 주(9/21 주) 응시 기록이 없습니다.");
});

test("반 분석 정기: 과목별 과락·최대 손실·하락, 위험 순 정렬", () => {
  const subjects = [{ id: "a", name: "헌법", fullScore: 100 }, { id: "b", name: "형법", fullScore: 100 }];
  const r = (studentId: string, a: number, b: number | undefined, flags: string[] = [], total = a + (b ?? 0)) =>
    ({ studentId, name: studentId, studentNumber: "90***", totalScore: total, subjectScores: (b === undefined ? { a } : { a, b }) as Record<string, number>, isPartial: b === undefined, internalRank: 1, flags: flags.map((kind) => ({ kind })) });
  const rows = regularCohortRisk([r("우수", 95, 90), r("하락", 80, 70, ["totalDrop", "targetGap"]), r("과락", 90, 30), r("부분", 50, undefined)], subjects, 40);
  assert.deepEqual(rows.map((x) => x.studentId), ["과락", "하락", "부분", "우수"], "과락 → 하락 → 점수 낮은 순");
  assert.equal(rows[0].summary, "과락 형법 · 최대 손실 형법 70점");
  assert.deepEqual(rows[0].cells.b, { value: 30, below: 1 });
  assert.equal(rows[1].summary, "과락 없음 · 최대 손실 형법 30점 · 총점 하락", "목표 미달(targetGap)은 하락이 아니다");
  assert.deepEqual(rows[2].cells.b, { value: null, below: 0 }, "응시하지 않은 과목은 과락이 아니다");
  assert.equal(regularCohortRisk([r("과락", 90, 30)], subjects, 0)[0].summary, "최대 손실 형법 70점", "기준 0이면 과락 문구 없음");
});

test("반 분석 아침: 과목 평균, 과락선 미만 회수, 하락 과목", () => {
  const subjects = [{ id: "a", name: "헌법", fullScore: 100 }, { id: "c", name: "형법", fullScore: 100 }];
  const s = (studentId: string, subjectId: string, scores: number[], flags: string[] = []) => ({ studentId, name: studentId, studentNumber: "90***", subjectId, subjectName: subjectId,
    average: scores.reduce((x, y) => x + y, 0) / scores.length, attended: scores.length, expected: scores.length, flags: flags.map((kind) => ({ kind })), series: scores.map((score) => ({ score })) });
  const rows = morningCohortRisk([s("가", "a", [80, 90]), s("가", "c", [30, 35, 60], ["consecutiveDrops"]), s("나", "a", [70, 75]), s("나", "c", [65, 70], ["lowAttendance"])], subjects, 40);
  assert.deepEqual(rows.map((x) => x.studentId), ["가", "나"]);
  assert.equal(rows[0].summary, "과락선 미만 형법(2회) · 점수 하락: 형법");
  assert.deepEqual(rows[0].cells.c, { value: 125 / 3, below: 2 });
  assert.equal(rows[1].summary, "과락선 미만 없음", "응시율 부족 진단은 하락이 아니다");
  assert.equal(rows[1].score, 70);
});

test("경찰 정기 250점(헌법 50·형사법 100·경찰학 100): 과목 만점은 문항 배점 합이고 과락선은 과목마다 만점의 40%", () => {
  // 과목 만점을 코드가 정하지 않는다. 가져온 파일의 문항 배점(2.5점)을 더한 값이다.
  const plan = [{ id: "h", name: "헌법", items: 20 }, { id: "c", name: "형사법", items: 40 }, { id: "p", name: "경찰학", items: 40 }];
  const aggregate = { count: 2, mean: 50, distribution: [{ score: 40, count: 1 }, { score: 60, count: 1 }], top10Avg: 60, top30Avg: 60, top10Count: 1, top30Count: 1, top10Complete: true, top30Complete: true };
  const session = { id: "now", divisionId: "d", examTypeId: "e", examDate: "2026-10-10", primarySubjectId: null, topic: null, fullScore: 250, itemCount: 100, externalCohortSize: 2,
    externalStats: { count: 2, mean: 160, distribution: [{ score: 150, count: 1 }, { score: 168, count: 1 }], subjects: Object.fromEntries(plan.map((s) => [s.id, aggregate])), regions: {} } };
  const participant = (studentId: string, h: number, c: number, p: number) => ({ divisionId: "d", sessionId: "now", studentId, region: null, subjectScores: { h, c, p }, totalScore: h + c + p, isPartial: false, externalRank: 1, externalPercentile: 50, regionalRank: null });
  const bundle = { divisionId: "d", examTypeId: "e", examDate: "2026-10-10", settings: structuredClone(DEFAULT_EXAM_ANALYSIS_SETTINGS),
    examTypes: [{ id: "e", name: "정기 모의고사", category: "REGULAR", subjects: plan.map((s) => ({ id: s.id, name: s.name, alternateGroup: null, totalItems: s.items, pointsPerItem: 2.5, isActive: true })) }],
    sessions: [session], participants: [participant("s1", 18, 80, 70), participant("s2", 20, 40, 90)],
    students: [{ id: "s1", divisionId: "d", name: "가", studentNumber: "90001" }, { id: "s2", divisionId: "d", name: "나", studentNumber: "90002" }],
    items: plan.flatMap((s) => Array.from({ length: s.items }, (_, i) => ({ divisionId: "d", sessionId: "now", subjectId: s.id, itemNo: i + 1, position: i + 1, answerKey: "1", points: 2.5, correctRatePct: 70, choiceRates: {}, mostCommonWrong: "2" }))),
    responses: [], targets: [] };
  const report = assembleRegularStudentReport(bundle as never, "s1", { role: "STUDENT", studentId: "s1" });
  assert.equal(report.session.fullScore, 250);
  assert.deepEqual(report.stats.subjects.map((s) => [s.name, s.fullScore]), [["헌법", 50], ["형사법", 100], ["경찰학", 100]]);
  const verdicts = report.stats.subjects.map((s) => subjectVerdict(s, 40));
  assert.equal(verdicts[0], "과락", "헌법 18점 < 50점의 40%(20점)");
  const other = assembleRegularStudentReport(bundle as never, "s2", { role: "STUDENT", studentId: "s2" });
  assert.notEqual(subjectVerdict(other.stats.subjects[0], 40), "과락", "헌법 20점은 과락선과 같으므로 통과");
  assert.notEqual(subjectVerdict(other.stats.subjects[1], 40), "과락", "형사법 40점은 100점의 40%와 같으므로 통과");
  const headline = regularHeadline({ total: report.myScore.total, fullScore: report.session.fullScore, isPartial: false, rank: 1, count: 2, topPercent: 50,
    subjects: report.stats.subjects.map((s) => ({ name: s.name, my: s.my, fullScore: s.fullScore, grade: s.grade })), failCutoffPercent: 40, easyWrong: 0, repeatedTopic: null, wrong: 0, declining: false });
  // 헌법 50점 중 32점, 경찰학 100점 중 30점을 잃었다. 총점에서 빠진 점수가 큰 과목을 고른다.
  assert.match(headline.text, /^총점 168\/250점 · 2명 중 1위\(상위 50%\) · 과락 헌법 · 헌법에서 32점을 가장 많이 잃었습니다\.$/);
});


test("학원 평균 격차는 하락과 분리하고 원래 비교 근거를 유지한다", () => {
 const base={studentId:'s',name:'학생',studentNumber:'1',subjectId:'a',subjectName:'헌법',average:70,attended:4,expected:4,series:[{score:60},{score:65},{score:70},{score:85}]};
 const [r]=morningCohortRisk([{...base,flags:[{kind:'classGap',detail:'최근 4회 평균이 같은 응시일의 반 평균보다 15점 낮습니다.'}]}],[{id:'a',name:'헌법',fullScore:100}],40);
 assert.deepEqual(r.declining,[]);
 assert.deepEqual(r.belowAverage,['헌법']);
 assert.doesNotMatch(r.summary,/하락/);
 assert.match(r.evidence![0].detail,/15점/);
 const [both]=morningCohortRisk([{...base,flags:[{kind:'classGap'},{kind:'ownAverageDrop'}]}],[{id:'a',name:'헌법',fullScore:100}],40);
 assert.deepEqual(both.declining,['헌법']);
 assert.deepEqual(both.belowAverage,['헌법']);
});
