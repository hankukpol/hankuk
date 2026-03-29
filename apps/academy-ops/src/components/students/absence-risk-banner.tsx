"use client";

import { AttendType } from "@prisma/client";
import { ATTENDANCE_STATUS_RULES } from "@/lib/constants";
import { getTuesdayWeekStart } from "@/lib/analytics/week";

type ScoreEntry = {
  attendType: AttendType;
  session: {
    examDate: string;
  };
};

type Props = {
  scores: ScoreEntry[];
};

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function describeRemaining(count: number, label: string) {
  if (count <= 0) {
    return `${label} 기준을 이미 초과했습니다.`;
  }

  return `${label}까지 ${count}회 남음`;
}

export function AbsenceRiskBanner({ scores }: Props) {
  const now = new Date();
  const weekStart = getTuesdayWeekStart(now);
  const weekEnd = endOfDay(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const occurredScores = scores.filter((score) => new Date(score.session.examDate).getTime() <= now.getTime());
  const weekAbsentCount = occurredScores.filter((score) => {
    const examDate = new Date(score.session.examDate);
    return (
      score.attendType === AttendType.ABSENT &&
      examDate.getTime() >= weekStart.getTime() &&
      examDate.getTime() <= weekEnd.getTime()
    );
  }).length;
  const monthAbsentCount = occurredScores.filter((score) => {
    const examDate = new Date(score.session.examDate);
    return (
      score.attendType === AttendType.ABSENT &&
      examDate.getTime() >= monthStart.getTime() &&
      examDate.getTime() <= monthEnd.getTime()
    );
  }).length;

  const remainingWeeklyDropout = ATTENDANCE_STATUS_RULES.weeklyDropoutAbsences - weekAbsentCount;
  const remainingMonthlyDropout = ATTENDANCE_STATUS_RULES.monthlyDropoutAbsences - monthAbsentCount;
  const shouldShow =
    weekAbsentCount >= ATTENDANCE_STATUS_RULES.weeklyWarning1Absences ||
    remainingMonthlyDropout <= 2;

  if (!shouldShow) {
    return null;
  }

  const isCritical = remainingWeeklyDropout <= 1 || remainingMonthlyDropout <= 1;
  const toneClass = isCritical
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <section className={`rounded-[28px] border px-5 py-4 ${toneClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="inline-flex rounded-full border border-current/15 px-2.5 py-0.5 text-xs font-semibold">
            출결 경고 알림
          </div>
          <h2 className="mt-3 text-lg font-semibold">이번 주와 이번 달 결시 위험을 확인하세요</h2>
        </div>
        <div className="text-right text-sm">
          <div>이번 주 무단 결시 {weekAbsentCount}회</div>
          <div>이번 달 무단 결시 {monthAbsentCount}회</div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-[24px] border border-current/10 bg-white/70 px-4 py-3">
          <p className="text-sm font-semibold">주간 기준</p>
          <p className="mt-2 text-sm">
            {describeRemaining(remainingWeeklyDropout, "주간 탈락 위험")}
          </p>
        </div>
        <div className="rounded-[24px] border border-current/10 bg-white/70 px-4 py-3">
          <p className="text-sm font-semibold">월간 기준</p>
          <p className="mt-2 text-sm">
            {describeRemaining(remainingMonthlyDropout, "월간 탈락 위험")}
          </p>
        </div>
      </div>
    </section>
  );
}