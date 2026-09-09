import assert from "node:assert/strict";
import test from "node:test";

import { isFollowUpDue } from "../../lib/interview-meta";
import { getPointAggregationInfo } from "../../lib/point-aggregation-mode";
import { getWarningNoticeChannelLabel } from "../../lib/warning-notice-meta";
import { interviewSchema, interviewUpdateSchema } from "../../lib/interview-schemas";
import { warningNoticeSchema } from "../../lib/warning-notice-schemas";
import type { ManagementPolicy } from "../../lib/management-policy";

const today = "2026-09-08";

function policy(overrides: Partial<ManagementPolicy> = {}) {
  return {
    effectiveFrom: "2026-09-01",
    monthlyPoints: true,
    ...overrides,
  } as ManagementPolicy;
}

test("follow-up is due only for open interviews whose date has arrived", () => {
  assert.equal(isFollowUpDue({ status: "OPEN", followUpDate: "2026-09-07" }, today), true);
  assert.equal(isFollowUpDue({ status: "OPEN", followUpDate: today }, today), true);
  assert.equal(isFollowUpDue({ status: "OPEN", followUpDate: "2026-09-09" }, today), false);
  // 종결한 면담은 예정일이 지났어도 다시 떠오르지 않는다.
  assert.equal(isFollowUpDue({ status: "CLOSED", followUpDate: "2026-09-01" }, today), false);
  // 예정일을 남기지 않았으면 대기 목록에 넣지 않는다.
  assert.equal(isFollowUpDue({ status: "OPEN", followUpDate: null }, today), false);
});

test("point aggregation mode follows the management policy switch", () => {
  assert.equal(getPointAggregationInfo(policy(), today).mode, "MONTHLY");
  assert.match(getPointAggregationInfo(policy(), today).label, /2026년 9월/);

  // 규정이 아직 시작되지 않았으면 과정 시작일 누적으로 남는다.
  assert.equal(
    getPointAggregationInfo(policy({ effectiveFrom: "2026-10-01" }), today).mode,
    "COURSE",
  );
  assert.equal(getPointAggregationInfo(policy({ monthlyPoints: false }), today).mode, "COURSE");
  assert.equal(getPointAggregationInfo(null, today).mode, "COURSE");
  assert.equal(getPointAggregationInfo(null, today).label, "학생별 과정 시작일부터 누적");
});

test("interview schema accepts follow-up fields and defaults to an open record", () => {
  const parsed = interviewSchema.parse({
    studentId: "student-1",
    date: today,
    reason: "벌점 누적",
    resultType: "INTERVIEW",
    followUpDate: "2026-09-15",
  });

  assert.equal(parsed.followUpDate, "2026-09-15");
  assert.equal(parsed.status, "OPEN");
  assert.equal(parsed.guardianContacted, false);

  // 빈 문자열로 넘어온 날짜는 "없음"으로 정규화한다.
  assert.equal(
    interviewSchema.parse({
      studentId: "student-1",
      date: today,
      reason: "벌점 누적",
      resultType: "INTERVIEW",
      followUpDate: "",
    }).followUpDate,
    null,
  );

  assert.throws(() =>
    interviewSchema.parse({
      studentId: "student-1",
      date: today,
      reason: "벌점 누적",
      resultType: "INTERVIEW",
      followUpDate: "2026-9-15",
    }),
  );
});

test("interview update schema rejects an empty patch", () => {
  assert.equal(interviewUpdateSchema.parse({ status: "CLOSED" }).status, "CLOSED");
  assert.equal(interviewUpdateSchema.parse({ followUpDate: null }).followUpDate, null);
  assert.throws(() => interviewUpdateSchema.parse({}));
});

test("warning notice schema requires a stage and a channel", () => {
  const parsed = warningNoticeSchema.parse({
    studentId: "student-1",
    stage: "WARNING_1",
    channel: "SMS",
    memo: "  보호자 부재  ",
  });

  assert.equal(parsed.memo, "보호자 부재");
  assert.equal(getWarningNoticeChannelLabel(parsed.channel), "문자");

  assert.throws(() =>
    warningNoticeSchema.parse({ studentId: "student-1", stage: "NORMAL", channel: "SMS" }),
  );
  assert.throws(() =>
    warningNoticeSchema.parse({ studentId: "student-1", stage: "WARNING_1", channel: "KAKAO" }),
  );
});
