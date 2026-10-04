"use client";

import { BarChart3, ExternalLink, FileText, LoaderCircle } from "lucide-react";

import type { InterviewContextSummary } from "@/lib/services/interview-context.service";

type InterviewContextPanelProps = {
  context: InterviewContextSummary | null;
  isLoading: boolean;
  error: string | null;
  /** 이 학생의 개인 성적 분석 주소. 면담 중 같은 화면에서 성적을 바로 연다. */
  scoreHref?: string;
  /** 이 학생의 A4 상담 자료 주소. */
  reportHref?: string;
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
  scoreHref,
  reportHref,
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

  const demeritTone = points.demeritPoints > 0 ? "text-admin-danger" : "";
  const summary: Array<{ label: string; value: string; tone?: string }> = [
    { label: "출결 미처리", value: `${attendance.unprocessedCount}칸`, tone: attendance.unprocessedCount > 0 ? "text-admin-warning" : "" },
    { label: "지각", value: `${attendance.tardyCount}회`, tone: attendance.tardyCount > 0 ? "text-admin-warning" : "" },
    { label: "결석", value: `${attendance.absentCount}회`, tone: attendance.absentCount > 0 ? "text-admin-danger" : "" },
    { label: "현재 벌점", value: `${points.demeritPoints}점`, tone: demeritTone },
  ];

  /* 면담 직전 확인용 요약. 패널 머리(학생·기간·성적 분석 버튼) → 숫자 4칸 → 이름 붙은 행 순서로 읽는다. */
  return (
    <section className="admin-panel mt-4" aria-label="최근 30일 요약">
      <div className="admin-panel-header">
        <div className="min-w-0">
          <h3 className="admin-section-title">
            {context.studentName}
            <span className="admin-help ml-2">{context.studentNumber}</span>
          </h3>
          <p className="admin-help mt-1">
            최근 {window.days}일 · {formatShortDate(window.dateFrom)} ~ {formatShortDate(window.dateTo)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {scoreHref ? (
            <a className="admin-button admin-button-compact" href={scoreHref} target="_blank" rel="noopener">
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              성적 분석
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">(새 탭)</span>
            </a>
          ) : null}
          {reportHref ? (
            <a className="admin-button admin-button-compact" href={reportHref} target="_blank" rel="noopener">
              <FileText className="h-4 w-4" aria-hidden="true" />
              상담 자료
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">(새 탭)</span>
            </a>
          ) : null}
        </div>
      </div>

      <dl className="admin-portal-summary grid-cols-2 border-x-0 border-t-0 sm:grid-cols-4">
        {summary.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd className={`admin-portal-summary-value ${item.tone ?? ""}`}>{item.value}</dd>
          </div>
        ))}
      </dl>

      <div className="admin-panel-row items-start">
        <span className="admin-label w-28 shrink-0 pt-1">벌점 상위 3건</span>
        {topDemerits.length ? (
          <ul className="min-w-0 flex-1 space-y-1">
            {topDemerits.map((record) => (
              <li key={record.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 break-keep">
                  <span className="admin-help mr-2 tabular-nums">{formatShortDate(record.date)}</span>
                  {record.displayName}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-admin-danger">{record.points}점</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="admin-help">기간 내 벌점 기록이 없습니다.</span>
        )}
      </div>
      <div className="admin-panel-row">
        <span className="admin-label w-28 shrink-0">남은 휴가 ({leave.month.slice(5).replace(/^0/, "")}월)</span>
        <span className="tabular-nums">
          외출 <strong>{leave.holidayRemaining}</strong> · 반휴 <strong>{leave.halfDayRemaining}</strong> · 병가 <strong>{leave.healthRemaining}</strong>
        </span>
      </div>
      <div className="admin-panel-row">
        <span className="admin-label w-28 shrink-0">경고 단계</span>
        <span>
          <strong>{points.warningStageLabel}</strong>
          <span className="admin-help ml-2">벌점 집계: {points.aggregationLabel}</span>
        </span>
      </div>
    </section>
  );
}
