import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContentTemplate,
  journalDayLabel,
  latestPromiseInterview,
  parseInterviewContent,
  parsePromises,
  sortJournal,
  summarizeByStudent,
} from "../../lib/interview-journal";

test("대괄호 소제목으로 면담 내용을 나누고 앞의 점 표시는 떼어 낸다", () => {
  const sections = parseInterviewContent(
    "면담 전 메모\n[학습 현황]\n· 입실 전 약 1년 독학\n· 회독 진행\n\n[성적] 8월 시험 경찰학 시간 부족\n- 형사법 2/3 정답\n[생활]\n00~01시 취침",
  );
  assert.deepEqual(sections.map((s) => s.title), [null, "학습 현황", "성적", "생활"]);
  assert.deepEqual(sections[1].lines, [
    { bullet: true, text: "입실 전 약 1년 독학" },
    { bullet: true, text: "회독 진행" },
  ]);
  // 소제목 줄 뒤에 붙여 쓴 글도 그 묶음의 첫 줄이다.
  assert.equal(sections[2].lines[0].text, "8월 시험 경찰학 시간 부족");
  assert.deepEqual(sections[3].lines, [{ bullet: false, text: "00~01시 취침" }]);
});

test("소제목이 없거나 빈 내용이면 그대로 한 묶음 또는 빈 목록", () => {
  assert.deepEqual(parseInterviewContent(""), []);
  assert.deepEqual(parseInterviewContent(null), []);
  assert.deepEqual(parseInterviewContent("그냥 적은 글\n두 번째 줄"), [
    { title: null, lines: [{ bullet: false, text: "그냥 적은 글" }, { bullet: false, text: "두 번째 줄" }] },
  ]);
});

test("약속은 한 줄에 하나, 번호·점 표시를 떼고 빈 줄은 버린다", () => {
  assert.deepEqual(
    parsePromises("· 등원 최소 10분 전\n\n1. 아침모의고사 현장 응시\n- 10월 말 회독 계획서 제출\n-3점 기준 유지"),
    ["등원 최소 10분 전", "아침모의고사 현장 응시", "10월 말 회독 계획서 제출", "-3점 기준 유지"],
  );
  assert.deepEqual(parsePromises(null), []);
});

test("기본 틀은 네 소제목이고 다시 읽으면 같은 소제목으로 나뉜다", () => {
  const template = buildContentTemplate();
  assert.deepEqual(parseInterviewContent(template).map((s) => s.title), ["학습 현황", "성적", "생활", "지도"]);
  assert.deepEqual(parseInterviewContent(buildContentTemplate(["태도", "목표"])).map((s) => s.title), ["태도", "목표"]);
});

test("날짜는 월/일(요일)", () => {
  assert.equal(journalDayLabel("2026-10-06"), "10/6(화)");
  assert.equal(journalDayLabel("2026-09-08T00:00:00.000Z"), "9/8(화)");
});

test("학생별 요약: 횟수·마지막 날짜·확인일 지난 면담", () => {
  const rows = [
    { studentId: "a", date: "2026-09-08", createdAt: "2026-09-08T10:00:00Z", status: "CLOSED", followUpDate: null },
    { studentId: "a", date: "2026-10-06", createdAt: "2026-10-06T10:00:00Z", status: "OPEN", followUpDate: "2026-10-07" },
    { studentId: "b", date: "2026-10-06", createdAt: "2026-10-06T11:00:00Z", status: "OPEN", followUpDate: "2026-10-20" },
  ];
  const map = summarizeByStudent(rows, "2026-10-07");
  assert.deepEqual(map.get("a"), { count: 2, lastDate: "2026-10-06", openCount: 1, overdue: true });
  assert.deepEqual(map.get("b"), { count: 1, lastDate: "2026-10-06", openCount: 1, overdue: false });
  assert.equal(map.get("c"), undefined);
});

test("약속 패널은 약속이 적힌 가장 최근 면담을 고른다", () => {
  const sorted = sortJournal([
    { studentId: "a", date: "2026-09-08", createdAt: "2026-09-08T10:00:00Z", status: "CLOSED", followUpDate: null, result: "· 첫 약속" },
    { studentId: "a", date: "2026-10-06", createdAt: "2026-10-06T10:00:00Z", status: "OPEN", followUpDate: null, result: "" },
  ]);
  assert.equal(sorted[0].date, "2026-10-06");
  assert.equal(latestPromiseInterview(sorted)?.date, "2026-09-08");
  assert.equal(latestPromiseInterview([]), null);
});
