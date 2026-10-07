import assert from "node:assert/strict";
import test from "node:test";

import { morningPersonalSummary } from "../../lib/exam-preview/morning-personal";
import type { PreviewData } from "../../lib/exam-preview/types";
import { recommendStudents } from "../../lib/interview-recommend";
import { summarizeMorningForInterview } from "../../lib/interview-score-summary";
import { isInStudentPointPeriod, studentPointPeriod } from "../../lib/student-point-period";
import { ATTENDANCE_LEGEND, VERDICT_WORDS, aboutRankOf100, regularFlagWords, studentAttendanceWord } from "../../lib/student-words";

const HARD_WORDS = /판정 불가|%p|성취율|취약 기준|손실 배점|최다 오답|상대 경쟁력|상계|반 석차/;

test("학생 말 사전: 판정·경고·출결 표시가 모두 쉬운 말이고 어려운 말을 쓰지 않는다", () => {
  for (const word of Object.values(VERDICT_WORDS)) assert.doesNotMatch(word, HARD_WORDS);
  assert.equal(VERDICT_WORDS["판정 불가"], "점수 정보 부족");
  for (const kind of ["totalDrop", "rankDrop", "targetGap", "weakSubject"]) {
    const withAmount = regularFlagWords({ kind, detail: "원래 문장", amount: 12.34, subject: "형법" });
    const withoutAmount = regularFlagWords({ kind, detail: "원래 문장" });
    assert.doesNotMatch(withAmount, HARD_WORDS, kind);
    assert.doesNotMatch(withoutAmount, HARD_WORDS, kind);
    assert.notEqual(withAmount, "원래 문장", `${kind} 는 쉬운 문장으로 바뀐다`);
  }
  assert.equal(regularFlagWords({ kind: "rankDrop", detail: "직전 시험보다 반 석차가 3계단 하락했습니다.", amount: 3 }), "지난 시험보다 학원 석차가 3계단 내려갔어요.");
  assert.equal(regularFlagWords({ kind: "weakSubject", detail: "", amount: 45, subject: "형법" }), "형법 점수가 낮아요(만점의 45%). 이 과목을 먼저 복습하세요.");
  assert.equal(regularFlagWords({ kind: "unknown", detail: "그대로" }), "그대로", "모르는 경고는 원래 문장");
  for (const item of ATTENDANCE_LEGEND) assert.doesNotMatch(`${item.short} ${item.long}`, HARD_WORDS);
  assert.equal(studentAttendanceWord("미처리"), "확인 전");
  assert.equal(studentAttendanceWord("해당없음"), "제외");
  assert.equal(studentAttendanceWord("출석"), "출석");
});

test("상위 비율은 '100명 중 약 n등'으로 바꾸고, 값이 없으면 문장을 만들지 않는다", () => {
  assert.equal(aboutRankOf100(12.3), "100명 중 약 12등");
  assert.equal(aboutRankOf100(0.2), "100명 중 약 1등");
  assert.equal(aboutRankOf100(null), null);
  assert.equal(aboutRankOf100(Number.NaN), null);
});

test("상벌점 기간: 위 숫자와 아래 표가 같은 기간을 본다", () => {
  const month = { dateFrom: "2026-10-01", dateTo: "2026-10-31" };
  const monthly = studentPointPeriod({ pointMetricScope: "monthly" }, month);
  assert.deepEqual(monthly, { scoped: true, from: "2026-10-01", to: "2026-10-31", label: "이번 달" });
  assert.equal(isInStudentPointPeriod("2026-09-30T23:00:00.000Z", monthly), false);
  assert.equal(isInStudentPointPeriod("2026-10-05T01:00:00.000Z", monthly), true);
  const course = studentPointPeriod({ pointMetricScope: "course", pointMetricDateFrom: "2026-08-01", pointMetricDateTo: "2026-12-31" }, month);
  assert.equal(course.label, "수강 기간");
  assert.equal(isInStudentPointPeriod("2026-08-15T00:00:00.000Z", course), true);
  const separate = studentPointPeriod({ meritPoints: 3 }, month);
  assert.equal(separate.scoped, true, "상점을 따로 세는 학원도 이번 달로 센다");
  const cumulative = studentPointPeriod({}, month);
  assert.deepEqual(cumulative, { scoped: false, from: null, to: null, label: "전체" });
  assert.equal(isInStudentPointPeriod("2020-01-01T00:00:00.000Z", cumulative), true, "기간이 없으면 전체 기록");
});

test("면담 권장 대상: 벌점 기준에 성적 신호(과락·하락)를 더하고 이유를 적는다", () => {
  const students = [
    { id: "a", name: "가", demerit: 30 },
    { id: "b", name: "나", demerit: 5 },
    { id: "c", name: "다", demerit: 0 },
    { id: "d", name: "라", demerit: 26 },
  ];
  const rows = recommendStudents(students, {
    demeritOf: (s) => s.demerit,
    warnInterview: 25,
    signals: [
      { studentId: "b", source: "morning", failed: ["형법(2회)"], declining: [] },
      { studentId: "c", source: "regular", failed: [], declining: ["석차 하락"] },
      { studentId: "d", source: "morning", failed: [], declining: ["헌법"] },
    ],
  });
  assert.deepEqual(rows.map((r) => r.student.id), ["a", "d", "b", "c"], "벌점 기준 학생 먼저(벌점 높은 순), 그다음 과락, 하락");
  assert.deepEqual(rows.find((r) => r.student.id === "b")!.reasons, [{ kind: "fail", text: "아침 과락: 형법(2회)" }]);
  assert.deepEqual(rows.find((r) => r.student.id === "d")!.reasons.map((r) => r.text), ["벌점 26점", "아침 하락: 헌법"]);
  assert.equal(rows.find((r) => r.student.id === "c")!.byScore, true);
  assert.equal(rows.find((r) => r.student.id === "a")!.byScore, false);
  // 다른 학원 기준(벌점 기준 35)이면 결과가 달라진다 — 기준값은 설정에서 온다.
  const strict = recommendStudents(students, { demeritOf: (s) => s.demerit, warnInterview: 35, signals: [] });
  assert.deepEqual(strict, []);
});

test("면담 성적 요약은 개인 성적표와 같은 결론을 쓰고 과목마다 먼저 볼 시험 하나를 고른다", () => {
  const c = (date: string, subjectId: string, subjectName: string, my: number | null, external: number) => ({ sessionId: `${date}-${subjectId}`, date, subjectId, subjectName, topic: "범위", fullScore: 100, my, internal: 60, external, top10: null, top30: null, internalCount: 20, externalCount: 200, externalFileCount: 200, internalRank: 3, externalRank: 30 });
  const item = (sessionId: string, date: string, subjectId: string, itemNo: number, externalRate: number, answer: string | null) => ({ id: `${sessionId}-${itemNo}`, sessionId, date, subjectId, subjectName: subjectId, itemNo, answerKey: "2", answer, correct: false, points: 5, externalRate, internalRate: null, responseCount: 0, choices: {}, mostCommonWrong: null });
  const data = {
    kind: "morning", scope: "student", examType: { id: "m", name: "아침 모의고사" }, student: { id: "s", name: "학생", studentNumber: "1" },
    range: { from: "2026-09-01", to: "2026-09-30" }, dates: [], easyThreshold: 70, failCutoffPercent: 40, records: [],
    subjects: [{ id: "a", name: "헌법" }, { id: "b", name: "형법" }],
    comparisons: [c("2026-09-08", "a", "헌법", 90, 70), c("2026-09-09", "b", "형법", 50, 70), c("2026-09-16", "b", "형법", 60, 65)],
    items: [item("2026-09-09-b", "2026-09-09", "b", 3, 90, "1"), item("2026-09-09-b", "2026-09-09", "b", 7, 30, null), item("2026-09-16-b", "2026-09-16", "b", 4, 80, "3")],
    morning: { settings: { morning: { movingAverageSessions: 1, classGapPercent: 10 } } },
  } as unknown as PreviewData;
  const summary = summarizeMorningForInterview(data)!;
  assert.deepEqual(summary.headline, morningPersonalSummary(data).headline);
  assert.deepEqual(summary.study.map((row) => [row.subjectName, row.date]), [["형법", "2026-09-09"]], "형법은 한 번만, 전체 평균보다 더 많이 낮았던 시험");
  assert.deepEqual(summary.study[0].easyItemNos, [3]);
  assert.deepEqual(summary.study[0].otherItemNos, [7]);
  assert.equal(summarizeMorningForInterview({ ...data, comparisons: [] } as PreviewData), null);
});
