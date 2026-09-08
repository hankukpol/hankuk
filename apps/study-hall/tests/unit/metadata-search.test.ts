import assert from "node:assert/strict";
import test from "node:test";
import { getAttendanceStatusLabel, getAttendanceStatusClasses } from "../../lib/attendance-meta";
import { normalizePointCategories, getPointCategoryLabel, formatPointValue } from "../../lib/point-meta";
import { getStudentStatusLabel, toDemeritPoints, getWarningStage, getWarningStageLabel } from "../../lib/student-meta";
import { getLeaveTypeLabel, getLeaveStatusLabel } from "../../lib/leave-meta";
import { getInterviewResultTypeLabel } from "../../lib/interview-meta";
import { getExamScheduleTypeLabel } from "../../lib/exam-schedule-meta";
import { formatStudyTrackLabel, getStudyTrackShortLabel } from "../../lib/study-track-meta";
import { hasStudentSearchQuery, matchesStudentSearch } from "../../lib/student-search";

test("attendance labels distinguish recognized absence, holiday, half holiday and inapplicability", () => {
  for (const [status, label] of [["PRESENT", "출석"], ["TARDY", "지각"], ["ABSENT", "결석"], ["EXCUSED", "사유결석"], ["HOLIDAY", "휴무"], ["HALF_HOLIDAY", "반휴"], ["NOT_APPLICABLE", "해당없음"]]) assert.equal(getAttendanceStatusLabel(status), label);
  for (const status of [null, undefined, "", "UNKNOWN"]) {
    assert.equal(getAttendanceStatusLabel(status), "미처리");
    assert.equal(getAttendanceStatusClasses(status), getAttendanceStatusClasses(null));
  }
  assert.notEqual(getAttendanceStatusClasses("PRESENT"), getAttendanceStatusClasses("ABSENT"));
  assert.notEqual(getAttendanceStatusClasses("TARDY"), getAttendanceStatusClasses("ABSENT"));
});

test("student labels preserve withdrawal and unknown-state fallback", () => {
  for (const [status, label] of [["ACTIVE", "재원"], ["ON_LEAVE", "일시중단"], ["WITHDRAWN", "퇴실"], ["GRADUATED", "수료"]]) assert.equal(getStudentStatusLabel(status), label);
  for (const status of [null, undefined, "", "UNKNOWN"]) {
    assert.equal(getStudentStatusLabel(status), "미정");
    assert.equal(getWarningStageLabel(status), "정상");
  }
});

test("penalty magnitude handles merit, penalty, zero and missing totals", () => {
  for (const value of [null, undefined, 0, 7]) assert.equal(toDemeritPoints(value), 0);
  assert.equal(toDemeritPoints(-7), 7);
  assert.equal(formatPointValue(-7), "-7점");
  assert.equal(formatPointValue(0), "0점");
  assert.equal(formatPointValue(7), "+7점");
});

test("warning stages honor custom thresholds at and immediately below each boundary", () => {
  const thresholds = Object.freeze({ warnLevel1: 7, warnLevel2: 13, warnInterview: 19, warnWithdraw: 31 });
  for (const [points, stage] of [[0, "NORMAL"], [6, "NORMAL"], [7, "WARNING_1"], [12, "WARNING_1"], [13, "WARNING_2"], [18, "WARNING_2"], [19, "INTERVIEW"], [30, "INTERVIEW"], [31, "WITHDRAWAL"], [100, "WITHDRAWAL"]] as const) assert.equal(getWarningStage(points, thresholds), stage);
  assert.equal(getWarningStage(7, { warnLevel1: 8, warnLevel2: 20, warnInterview: 30, warnWithdraw: 40 }), "NORMAL");
});

test("point category normalization preserves custom labels, stable order and input data", () => {
  const input = Object.freeze([" 시험 ", null, "시험", "  ", 1, "상담", "출결"]);
  assert.deepEqual(normalizePointCategories(input), ["시험", "상담", "출결"]);
  const many = Array.from({ length: 31 }, (_, i) => `범주${i}`);
  assert.deepEqual(normalizePointCategories(many), many.slice(0, 30));
  for (const value of [undefined, null, [], {}, [null, ""]]) assert.deepEqual(normalizePointCategories(value), ["출결", "생활", "시험", "자습", "기타"]);
  const defaults = normalizePointCategories(null);
  defaults.pop();
  assert.equal(normalizePointCategories(null).length, 5);
  for (const value of [undefined, null, "", " "]) assert.equal(getPointCategoryLabel(value), "기타");
  assert.equal(getPointCategoryLabel(" 자체 항목 "), "자체 항목");
});

test("leave and interview metadata distinguish business states with safe missing-value labels", () => {
  assert.equal(getLeaveTypeLabel("HOLIDAY"), "연가");
  assert.equal(getLeaveTypeLabel("HALF_DAY"), "반차");
  assert.equal(getLeaveTypeLabel("HEALTH"), "병가");
  assert.equal(getLeaveTypeLabel("OUTING"), "외출");
  assert.equal(getLeaveStatusLabel("PENDING"), "대기");
  assert.equal(getLeaveStatusLabel("APPROVED"), "승인");
  assert.equal(getLeaveStatusLabel("REJECTED"), "승인 취소");
  assert.equal(getLeaveStatusLabel("USED"), "사용 완료");
  assert.equal(getInterviewResultTypeLabel("WITHDRAWAL"), "퇴실 논의");
  assert.equal(getExamScheduleTypeLabel("WRITTEN"), "필기");
  assert.equal(getExamScheduleTypeLabel("RESULT"), "합격발표");
  for (const value of [null, undefined, "", "UNKNOWN"]) {
    assert.equal(getLeaveTypeLabel(value), "미정");
    assert.equal(getLeaveStatusLabel(value), "미정");
    assert.equal(getInterviewResultTypeLabel(value), "미정");
  }
});

test("study tracks retain custom names with compact labels and a missing-value fallback", () => {
  for (const value of [undefined, null, "", "  "]) {
    assert.equal(formatStudyTrackLabel(value), "미지정");
    assert.equal(getStudyTrackShortLabel(value), "미지정");
  }
  for (const [track, label] of [["경찰 공채", "경찰"], ["소방 경채", "소방"], ["일반행정", "행정직"], ["일행 준비", "일행직"], ["9급 준비", "9급"], ["공무원 세무", "세무"], ["공무원", "공무원"], ["가나다라마바사", "가나다라마바"]]) assert.equal(getStudyTrackShortLabel(track), label);
  assert.equal(formatStudyTrackLabel("  자체 직렬  "), "자체 직렬");
});

test("empty search matches every student, including incomplete records", () => {
  for (const query of ["", " \n\t "]) {
    assert.equal(hasStudentSearchQuery(query), false);
    assert.equal(matchesStudentSearch({}, query), true);
    assert.equal(matchesStudentSearch({ name: null, phone: undefined }, query), true);
  }
  assert.equal(hasStudentSearchQuery(" 김 "), true);
  assert.equal(matchesStudentSearch({}, "김"), false);
});

test("student search finds identity, phone, room, seat and track through normalization", () => {
  const student = Object.freeze({ name: " Kim 학생 ", studentNumber: "00017", phone: "010-1234-5678", seatDisplay: "2실 A-01", seatLabel: "A-01", studyRoomName: "자습 (2실)", studyTrack: "경찰 공채" });
  for (const query of [" kim ", "학생", "00017", "01012345678", "1234-5678", "2실A01", "a01", "자습2실", "경찰공채"]) assert.equal(matchesStudentSearch(student, query), true, query);
  for (const query of ["없는학생", "01099998888", "B-99", "소방"]) assert.equal(matchesStudentSearch(student, query), false, query);
});

test("search extras are optional, case-insensitive and do not turn punctuation into match-all", () => {
  assert.equal(matchesStudentSearch({ name: "김학생" }, "special", [null, undefined, "  ", " SPECIAL group "]), true);
  assert.equal(matchesStudentSearch({ name: "김학생" }, "-", [null, " "]), false);
  assert.equal(matchesStudentSearch({ name: "김학생" }, "()"), false);
  assert.equal(matchesStudentSearch({ name: null, phone: null }, "김"), false);
});
