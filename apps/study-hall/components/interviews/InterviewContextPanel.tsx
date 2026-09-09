"use client";

import { LoaderCircle } from "lucide-react";

import type { InterviewContextSummary } from "@/lib/services/interview-context.service";

type InterviewContextPanelProps = {
  context: InterviewContextSummary | null;
  isLoading: boolean;
  error: string | null;
};

function formatShortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

/**
 * 면담을 시작하기 전에 필요한 최근 30일 사실을 한 화면에 모은다.
 * 관리자가 출석부·상벌점·휴가 화면을 따로 열어보던 준비 시간을 없앤다.
 */
export function InterviewContextPanel({
  context,
  isLoading,
  error,
}: InterviewContextPanelProps) {
  if (isLoading) {
    return (
      <div className="admin-notice mt-4 flex items-center gap-2">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        최근 30일 요약을 불러오는 중입니다.
      </div>
    );
  }

  if (error) {
    return <div className="admin-notice mt-4">{error}</div>;
  }

  if (!context) {
    return null;
  }

  const { attendance, topDemerits, leave, points, window } = context;

  return (
    <div className="admin-notice mt-4 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-slate-900">
          {context.studentName}
          <span className="admin-help ml-2">{context.studentNumber}</span>
        </p>
        <p className="admin-help">
          최근 {window.days}일 ({formatShortDate(window.dateFrom)}~{formatShortDate(window.dateTo)})
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <dt className="admin-label">출결 미처리</dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900">
            {attendance.unprocessedCount}칸
          </dd>
        </div>
        <div>
          <dt className="admin-label">지각</dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900">
            {attendance.tardyCount}회
          </dd>
        </div>
        <div>
          <dt className="admin-label">결석</dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-slate-900">
            {attendance.absentCount}회
          </dd>
        </div>
        <div>
          <dt className="admin-label">현재 벌점</dt>
          <dd className="mt-1 text-lg font-bold tabular-nums text-admin-danger">
            {points.demeritPoints}점
          </dd>
        </div>
      </dl>

      <div>
        <p className="admin-label">벌점 상위 3건</p>
        {topDemerits.length ? (
          <ul className="mt-2 space-y-1">
            {topDemerits.map((record) => (
              <li key={record.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">
                  <span className="admin-help mr-2 tabular-nums">
                    {formatShortDate(record.date)}
                  </span>
                  {record.displayName}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-admin-danger">
                  {record.points}점
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="admin-help mt-2">기간 내 벌점 기록이 없습니다.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-admin-line-soft pt-3">
        <p className="admin-help">
          미사용 휴무 ({leave.month}) · 외출 <strong className="tabular-nums">{leave.holidayRemaining}</strong>
          {" · "}반휴 <strong className="tabular-nums">{leave.halfDayRemaining}</strong>
          {" · "}병가 <strong className="tabular-nums">{leave.healthRemaining}</strong>
        </p>
        <p className="admin-help">
          집계 기준 {points.aggregationLabel} · 현재 단계 {points.warningStageLabel}
        </p>
      </div>
    </div>
  );
}
