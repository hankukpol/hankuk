import assert from "node:assert/strict";
import test from "node:test";

import { selectPeriodForCheck, kstMinutesOfDay } from "../../lib/attendance-meta";

test("체크할 교시는 진행 중인 교시, 쉬는 시간에는 곧 시작할 교시, 하루가 끝나면 마지막 교시", () => {
  const periods = [
    { id: "1", startTime: "09:15", endTime: "10:45" },
    { id: "2", startTime: "11:00", endTime: "12:30" },
    { id: "3", startTime: "13:45", endTime: "15:15" },
  ];
  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return selectPeriodForCheck(periods, h * 60 + m)?.id;
  };

  assert.equal(at("09:00"), "1", "시작 전에는 첫 교시");
  assert.equal(at("10:00"), "1", "교시 중");
  assert.equal(at("10:48"), "1", "종료 후 5분까지는 그 교시");
  // 이 줄이 이 함수가 있는 이유다. 오후 1시에 출석부를 열면 1교시가 아니라 3교시여야 한다.
  assert.equal(at("13:03"), "3", "쉬는 시간에는 곧 시작할 교시");
  assert.equal(at("12:35"), "2", "2교시 종료 후 딱 5분까지는 아직 2교시");
  assert.equal(at("12:36"), "3", "유예가 지나면 다음 교시");
  assert.equal(at("22:00"), "3", "하루가 끝나면 마지막 교시");

  assert.equal(selectPeriodForCheck([], 600), null);
  assert.equal(selectPeriodForCheck([{ ...periods[0], isActive: false }], 600), null, "비활성 교시는 고르지 않는다");
  // 순서가 뒤섞여 들어와도 시각으로 정렬해 판단한다.
  assert.equal(selectPeriodForCheck([periods[2], periods[0], periods[1]], 13 * 60 + 3)?.id, "3");
});

test("kstMinutesOfDay 는 서울 자정 기준 분을 돌려준다", () => {
  // 2026-09-10T04:03:00Z = 서울 13:03
  assert.equal(kstMinutesOfDay(new Date("2026-09-10T04:03:00Z")), 13 * 60 + 3);
  assert.equal(kstMinutesOfDay(new Date("2026-09-09T15:00:00Z")), 0, "서울 자정");
});
