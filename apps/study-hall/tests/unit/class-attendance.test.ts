import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTENDANCE_INPUT_OPTIONS,
  ATTENDANCE_STATUS_OPTIONS,
  buildAttendanceInput,
  getAttendanceInputValue,
  getAttendanceCountStatus,
  getAttendanceReasonDetail,
  getAttendanceStatusLabel,
  isAttendedAttendanceStatus,
  isAttendanceRateExcluded,
  isClassAttendance,
  setAttendanceReasonDetail,
} from "../../lib/attendance-meta";

test("수업 선택은 기존 인정 출석 형식으로 저장하고 다시 수업으로 읽는다", () => {
  assert.ok(ATTENDANCE_INPUT_OPTIONS.some((option) => option.value === "CLASS" && option.label === "수업"));
  assert.ok(!ATTENDANCE_STATUS_OPTIONS.some((option) => String(option.value) === "CLASS"));
  const saved = buildAttendanceInput("CLASS");
  assert.deepEqual(saved, { status: "EXCUSED", reason: "수업" });
  assert.equal(getAttendanceInputValue(saved.status, saved.reason), "CLASS");
  assert.equal(getAttendanceStatusLabel(saved.status, saved.reason), "수업");
  assert.equal(isAttendedAttendanceStatus(saved.status, saved.reason), true);
  assert.equal(getAttendanceCountStatus(saved.status, saved.reason), "PRESENT");
  assert.equal(isAttendanceRateExcluded(saved.status, saved.reason), false);
});

test("일반 사유결석은 출석으로 인정하지 않고 출석률 분모에서 제외한다", () => {
  for (const reason of [undefined, null, "", "병원 진료", "수업 미참석"]) {
    assert.equal(isAttendedAttendanceStatus("EXCUSED", reason), false);
    assert.equal(getAttendanceCountStatus("EXCUSED", reason), "EXCUSED");
    assert.equal(isAttendanceRateExcluded("EXCUSED", reason), true);
  }
  assert.equal(isAttendanceRateExcluded("ABSENT", "무단결석"), false);
  assert.equal(isAttendanceRateExcluded(undefined), false, "미처리는 평가 대상에 남는다");
  assert.equal(isAttendanceRateExcluded("NOT_APPLICABLE"), true);
  assert.equal(isAttendedAttendanceStatus("PRESENT"), true);
});

test("기존 수업 사유만 식별하고 관련 없는 자유 입력 사유는 바꾸지 않는다", () => {
  for (const reason of ["수업", " 수업 ", "수업: 형법 기본이론"]) {
    assert.equal(getAttendanceInputValue("EXCUSED", reason), "CLASS");
    assert.equal(getAttendanceStatusLabel("EXCUSED", reason), "수업");
    assert.deepEqual(buildAttendanceInput("CLASS", { status: "EXCUSED", reason }), { status: "EXCUSED", reason });
  }
  for (const reason of [undefined, null, "", "병원", "수업 미참석", "정규 수업 수강"]) {
    assert.equal(isClassAttendance("EXCUSED", reason), false);
    assert.equal(getAttendanceStatusLabel("EXCUSED", reason), "사유결석");
  }
  for (const status of [undefined, null, "", "ABSENT", "PRESENT"]) {
    assert.equal(isClassAttendance(status, "수업"), false);
  }
});

test("선택 사항인 수업명을 입력하거나 지워도 수업 상태가 유지된다", () => {
  let cell = buildAttendanceInput("CLASS");
  for (const detail of ["형법 ", "형법 기본이론", ""]) {
    cell = { ...cell, reason: setAttendanceReasonDetail(cell.status, cell.reason, detail) };
    assert.equal(getAttendanceReasonDetail(cell.status, cell.reason), detail);
    assert.equal(getAttendanceInputValue(cell.status, cell.reason), "CLASS");
  }
  assert.equal(cell.reason, "수업");
  assert.equal(setAttendanceReasonDetail("EXCUSED", "병원", "진료"), "진료");
});

test("수업에서 다른 상태로 전환할 때 수업 표시를 남기지 않는다", () => {
  const current = { status: "EXCUSED" as const, reason: "수업: 형법 기본이론" };
  assert.deepEqual(buildAttendanceInput("PRESENT", current), { status: "PRESENT", reason: "" });
  assert.deepEqual(buildAttendanceInput("", current), { status: "", reason: "" });
  assert.deepEqual(buildAttendanceInput("EXCUSED", current), { status: "EXCUSED", reason: "" });
  assert.deepEqual(buildAttendanceInput("ABSENT", current), { status: "ABSENT", reason: "" });
  assert.deepEqual(buildAttendanceInput("EXCUSED", buildAttendanceInput("CLASS")), { status: "EXCUSED", reason: "" });
  assert.deepEqual(buildAttendanceInput("EXCUSED", { status: "ABSENT", reason: "병원" }), { status: "EXCUSED", reason: "병원" });
});
