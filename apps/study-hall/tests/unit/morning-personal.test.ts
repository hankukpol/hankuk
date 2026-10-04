import assert from "node:assert/strict";
import test from "node:test";
import { gapText, isoWeekMonday, morningPersonalSummary, morningStudyRows, subjectParticle } from "../../lib/exam-preview/morning-personal";
import { DEFAULT_EXAM_ANALYSIS_SETTINGS } from "../../lib/exam-analysis-settings";
import type { Comparison, PreviewData, PreviewItem } from "../../lib/exam-preview/types";

const subjects = [{ id: "h", name: "헌법" }, { id: "p", name: "형사소송법" }, { id: "c", name: "형법" }, { id: "k", name: "경찰학" }];
const name = (id: string) => subjects.find((s) => s.id === id)!.name;
const row = (sessionId: string, date: string, subjectId: string, my: number | null, external: number | null, fullScore = 100, topic: string | null = null): Comparison => ({
  sessionId, date, subjectId, subjectName: name(subjectId), topic, fullScore, my, internal: null, external,
  top10: null, top30: null, internalCount: 0, externalCount: null, externalFileCount: 0, internalRank: null, externalRank: null,
});
const item = (sessionId: string, subjectId: string, itemNo: number, correct: boolean | null, externalRate: number | null, answer: string | null = "1"): PreviewItem => ({
  id: `${sessionId}-${itemNo}`, sessionId, date: "", subjectId, subjectName: name(subjectId), itemNo, answerKey: "2", answer, correct,
  points: 5, externalRate, internalRate: null, responseCount: 0, choices: {}, mostCommonWrong: null,
});
function data(comparisons: Comparison[], items: PreviewItem[] = [], settings = DEFAULT_EXAM_ANALYSIS_SETTINGS): PreviewData {
  return {
    kind: "morning", scope: "student", examType: { id: "m", name: "아침" }, student: { id: "s", name: "가", studentNumber: "1" },
    range: { from: "2026-09-01", to: "2026-10-02" }, dates: [], subjects, comparisons, items, easyThreshold: 70, failCutoffPercent: 40, records: [],
    morning: { settings } as never,
  };
}
// 학원 기준: 비교 4회 이상이면 판단, 평균보다 15점 이상 높으면 잘하고 있음(기본 설정값).
const base = [
  ...["09-07", "09-14", "09-21", "09-28"].map((d, i) => row(`h${i}`, `2026-${d}`, "h", 85, 80)),
  ...["09-08", "09-15", "09-22", "09-29"].map((d, i) => row(`p${i}`, `2026-${d}`, "p", 70, 78)),
  ...["09-09", "09-16", "09-23", "09-30"].map((d, i) => row(`c${i}`, `2026-${d}`, "c", 78, 77)),
  row("k0", "2026-09-17", "k", 80, 76), row("k1", "2026-10-01", "k", null, 75),
];

test("과목별 내 평균·전체 평균·차이와 상태: 가장 낮은 과목 하나만 '가장 먼저 복습'", () => {
  const summary = morningPersonalSummary(data(base));
  const by = Object.fromEntries(summary.subjects.map((s) => [s.name, s]));
  assert.deepEqual([by.헌법.my, by.헌법.benchmark, by.헌법.gap, by.헌법.statusLabel], [85, 80, 5, "평균 이상"]);
  assert.deepEqual([by.형사소송법.gap, by.형사소송법.statusLabel], [-8, "가장 먼저 복습"]);
  assert.deepEqual([by.형법.gap, by.형법.statusLabel], [1, "평균 이상"]);
  // 경찰학은 비교 1회뿐 → 참고. 결시 1회는 응시에서 빠진다.
  assert.deepEqual([by.경찰학.few, by.경찰학.attended, by.경찰학.expected], [true, 1, 2]);
  assert.equal(summary.headline.text, "헌법은 전체 평균보다 5점 높습니다. 형사소송법이 전체 평균보다 8점 낮아 가장 먼저 복습해야 합니다.");
  assert.equal(summary.headline.tone, "warning");
  assert.deepEqual(summary.overall, { my: 77.8, benchmark: 78.2, gap: -0.3, attended: 13, expected: 14 });
});

test("기록이 적은 과목은 더 낮아도 '가장 먼저 복습'을 기록이 충분한 과목에 양보한다", () => {
  const summary = morningPersonalSummary(data([...base, row("k2", "2026-09-24", "k", 40, 76)]));
  const by = Object.fromEntries(summary.subjects.map((s) => [s.name, s]));
  assert.equal(by.경찰학.gap, -16);
  assert.equal(by.경찰학.statusLabel, "복습 필요");
  assert.equal(by.형사소송법.statusLabel, "가장 먼저 복습");
});

test("과락이 있으면 상태와 결론에 먼저 나온다", () => {
  const summary = morningPersonalSummary(data([...base, row("h9", "2026-10-02", "h", 35, 80)]));
  const constitution = summary.subjects.find((s) => s.name === "헌법")!;
  assert.equal(constitution.statusLabel, "과락 1회");
  assert.match(summary.headline.text, /^헌법에서 과락 점수가 있었습니다\./);
  assert.equal(summary.headline.tone, "danger");
});

test("'잘하고 있음'은 학원 설정의 평균 격차 기준을 쓴다", () => {
  const settings = structuredClone(DEFAULT_EXAM_ANALYSIS_SETTINGS);
  settings.morning.classGapPercent = 5;
  const summary = morningPersonalSummary(data(base, [], settings));
  assert.equal(summary.subjects.find((s) => s.name === "헌법")!.statusLabel, "잘하고 있음");
});

test("주간 칸은 같은 주의 모든 시험을 날짜와 함께 남기고, 결시는 점수 없음이다", () => {
  const summary = morningPersonalSummary(data([...base, row("c9", "2026-10-02", "c", 30, 77)]));
  assert.deepEqual(summary.weeks, ["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
  const criminal = summary.subjects.find((s) => s.name === "형법")!;
  assert.deepEqual(criminal.weeks[3], [{ date: "2026-09-30", my: 78, below: false }, { date: "2026-10-02", my: 30, below: true }]);
  const police = summary.subjects.find((s) => s.name === "경찰학")!;
  assert.deepEqual(police.weeks[3], [{ date: "2026-10-01", my: null, below: false }]);
});

test("만점이 다른 회차는 100점 기준으로 바꿔 비교한다", () => {
  const summary = morningPersonalSummary(data([row("x1", "2026-09-07", "h", 40, 30, 50), row("x2", "2026-09-14", "h", 80, 80)]));
  const constitution = summary.subjects[0];
  assert.deepEqual([constitution.my, constitution.benchmark, constitution.gap], [80, 70, 10]);
  assert.equal(summary.scaledNote, true);
});

test("성적이 없으면 결론은 안내 문장이다", () => {
  assert.equal(morningPersonalSummary(data([])).headline.text, "조회 기간에 응시한 아침 모의고사가 없습니다.");
});

test("공부할 것: 평균보다 많이 낮았던 시험부터, 많이 맞힌 문제의 오답을 따로 묶는다", () => {
  const items = [
    item("p3", "p", 15, false, 85), item("p3", "p", 16, false, 90), item("p3", "p", 14, false, 40), item("p3", "p", 20, false, 80, null), item("p3", "p", 1, true, 95),
    item("h3", "h", 3, false, 50), item("c3", "c", 4, true, 60), item("k0", "k", 7, null, 90),
  ];
  const rows = morningStudyRows(data(base, items));
  assert.deepEqual(rows.map((r) => [r.subjectName, r.date, r.gap]), [["형사소송법", "2026-09-29", -8], ["헌법", "2026-09-28", 5]]);
  assert.deepEqual(rows[0].easy.map((i) => i.itemNo), [15, 16]);
  assert.deepEqual(rows[0].other.map((i) => i.itemNo), [14, 20], "답을 비운 문항은 많이 맞힌 문제여도 '그 외'");
});

test("표현 도우미", () => {
  assert.equal(gapText(5), "5점 높음");
  assert.equal(gapText(-8.04), "8점 낮음");
  assert.equal(gapText(0), "평균과 같음");
  assert.equal(gapText(-6.25), "6.3점 낮음", "음수의 0.5 도 평균 표시(76.25 → 76.3)와 같은 방향으로 반올림");
  assert.equal(gapText(6.25), "6.3점 높음");
  assert.equal(gapText(null), "비교 자료 없음");
  assert.equal(subjectParticle("헌법", "은", "는"), "헌법은");
  assert.equal(subjectParticle("경찰학", "이", "가"), "경찰학이");
  assert.equal(subjectParticle("형사소송법", "이", "가"), "형사소송법이");
  assert.equal(subjectParticle("국어", "이", "가"), "국어가");
  assert.equal(isoWeekMonday(2026, 40), "2026-09-28");
  assert.equal(isoWeekMonday(2026, 1), "2025-12-29");
});

test("주소에 시험 구분이 없으면 성적이 있는 시험을 먼저 연다", async () => {
  const { defaultKindDecision } = await import("../../lib/exam-preview/selection");
  const regular = (loaded: boolean, examDates: number, error = false) => ({ loaded, error, examDates });
  assert.equal(defaultKindDecision({ hasMorningType: true, hasRegularType: true, regular: regular(false, 0) }), "wait");
  assert.equal(defaultKindDecision({ hasMorningType: true, hasRegularType: true, regular: regular(true, 0) }), "morning", "정기 시험 0회");
  assert.equal(defaultKindDecision({ hasMorningType: true, hasRegularType: true, regular: regular(true, 3) }), "regular");
  assert.equal(defaultKindDecision({ hasMorningType: true, hasRegularType: true, regular: regular(true, 0, true) }), "morning");
  assert.equal(defaultKindDecision({ hasMorningType: true, hasRegularType: false, regular: regular(false, 0) }), "morning", "정기 시험 종류가 없음");
  assert.equal(defaultKindDecision({ hasMorningType: false, hasRegularType: true, regular: regular(true, 0) }), "regular", "아침 시험 종류가 없으면 그대로");
});
