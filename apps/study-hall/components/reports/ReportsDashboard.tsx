"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Download, LoaderCircle, RefreshCcw } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/sonner";
import { ExamAnalysisExport } from "@/components/reports/ExamAnalysisExport";
import { formatExamDateLabel } from "@/lib/exam-date-label";
import { AdminTabs } from "@/components/ui/AdminTabs";

import { getWarningStageLabel } from "@/lib/student-meta";
import type {
  ActivityActionType,
  ActivityLogData,
  ReportData,
  ReportSelection,
} from "@/lib/services/report.service";

type ReportsDashboardProps = {
  divisionSlug: string;
  selection: ReportSelection;
  data: ReportData;
  initialActivityLog: ActivityLogData;
};

const ReportsTrendChart = dynamic(
  () => import("@/components/reports/ReportsTrendChart").then((mod) => mod.ReportsTrendChart),
  {
    ssr: false,
    loading: () => <div className="admin-skeleton h-full w-full" aria-hidden="true" />,
  },
);

const activityActionOptions: Array<{ value: ActivityActionType; label: string }> = [
  { value: "POINT", label: "상벌점" },
  { value: "ATTENDANCE_EDIT", label: "출결 수정" },
  { value: "STUDENT_STATUS", label: "학생 상태 변경" },
  { value: "INTERVIEW", label: "면담" },
];

function formatPointDelta(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

const REPORT_TABS = [
  { id: "report" as const, label: "통계 대시보드" },
  { id: "activity" as const, label: "활동 로그" },
];

export function ReportsDashboard({
  divisionSlug,
  selection,
  data,
  initialActivityLog,
}: ReportsDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const flags = data.featureFlags;
  const [tab, setTab] = useState<"report" | "activity">("report");
  const [period, setPeriod] = useState<ReportSelection["period"]>(selection.period);
  const [date, setDate] = useState("date" in selection ? selection.date : data.range.dateTo);
  const [month, setMonth] = useState(
    "month" in selection ? selection.month : data.range.month ?? data.range.dateTo.slice(0, 7),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [activity, setActivity] = useState(initialActivityLog);
  const [activityDateFrom, setActivityDateFrom] = useState(initialActivityLog.dateFrom);
  const [activityDateTo, setActivityDateTo] = useState(initialActivityLog.dateTo);
  const [activityActorId, setActivityActorId] = useState(initialActivityLog.actorId ?? "ALL");
  const [activityActionType, setActivityActionType] = useState<ActivityActionType | "ALL">(
    initialActivityLog.actionType ?? "ALL",
  );
  const [isActivityLoading, setIsActivityLoading] = useState(false);
  const [hasRequestedActivity, setHasRequestedActivity] = useState(
    initialActivityLog.items.length > 0 || initialActivityLog.actorOptions.length > 0,
  );

  const availableActivityActionOptions = useMemo(
    () =>
      activityActionOptions.filter((option) => activity.availableActionTypes.includes(option.value)),
    [activity.availableActionTypes],
  );

  const exportLinks = useMemo(() => {
    const rangeParams = new URLSearchParams({
      dateFrom: data.range.dateFrom,
      dateTo: data.range.dateTo,
    });
    const monthParam = data.range.month ?? data.range.dateTo.slice(0, 7);
    const activityParams = new URLSearchParams({
      dateFrom: activityDateFrom,
      dateTo: activityDateTo,
    });

    if (activityActorId !== "ALL") activityParams.set("actorId", activityActorId);
    if (activityActionType !== "ALL") activityParams.set("actionType", activityActionType);

    return {
      attendance: `/api/${divisionSlug}/export/attendance?${rangeParams.toString()}`,
      points: `/api/${divisionSlug}/export/points?${rangeParams.toString()}`,
      monthly: `/api/${divisionSlug}/export/monthly?month=${monthParam}`,
      payments: `/api/${divisionSlug}/export/payments?${rangeParams.toString()}`,
      activity: `/api/${divisionSlug}/export/activity?${activityParams.toString()}`,
    };
  }, [
    activityActionType,
    activityActorId,
    activityDateFrom,
    activityDateTo,
    data.range.dateFrom,
    data.range.dateTo,
    data.range.month,
    divisionSlug,
  ]);

  const reportButtons = [
    flags.attendanceManagement ? { href: exportLinks.attendance, label: "출결 내보내기" } : null,
    flags.pointManagement ? { href: exportLinks.points, label: "상벌점 내보내기" } : null,
    { href: exportLinks.monthly, label: "월간 종합 내보내기" },
    flags.paymentManagement ? { href: exportLinks.payments, label: "수납 내보내기" } : null,
  ].filter(Boolean) as Array<{ href: string; label: string }>;

  const showTrend = flags.attendanceManagement;
  const showPointMovers = flags.pointManagement;
  const showDailyTable = flags.attendanceManagement && data.period === "daily";
  const showRanking =
    flags.attendanceManagement ||
    flags.pointManagement ||
    flags.warningManagement ||
    flags.examManagement ||
    flags.seatManagement;
  const rankingColSpan = [
    true,
    flags.attendanceManagement,
    flags.attendanceManagement,
    flags.attendanceManagement,
    flags.attendanceManagement,
    flags.pointManagement,
    flags.pointManagement,
    flags.warningManagement,
    flags.examManagement,
  ].filter(Boolean).length;

  const refreshActivityLogs = useCallback(
    async (showToast = false) => {
      setIsActivityLoading(true);

      try {
        const params = new URLSearchParams({
          dateFrom: activityDateFrom,
          dateTo: activityDateTo,
        });
        if (activityActorId !== "ALL") params.set("actorId", activityActorId);
        if (activityActionType !== "ALL") params.set("actionType", activityActionType);

        const response = await fetch(`/api/${divisionSlug}/reports/activity?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "활동 로그를 불러오지 못했습니다.");

        setActivity(payload.activity);
        setHasRequestedActivity(true);

        if (showToast) toast.success("활동 로그를 새로고침했습니다.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "활동 로그를 불러오지 못했습니다.");
      } finally {
        setIsActivityLoading(false);
      }
    },
    [activityActionType, activityActorId, activityDateFrom, activityDateTo, divisionSlug],
  );

  useEffect(() => {
    if (activityActionType !== "ALL" && !activity.availableActionTypes.includes(activityActionType)) {
      setActivityActionType("ALL");
    }
  }, [activity.availableActionTypes, activityActionType]);

  useEffect(() => {
    if (activityActorId !== "ALL" && !activity.actorOptions.some((actor) => actor.id === activityActorId)) {
      setActivityActorId("ALL");
    }
  }, [activity.actorOptions, activityActorId]);

  useEffect(() => {
    if (tab !== "activity" || hasRequestedActivity || isActivityLoading) return;
    setHasRequestedActivity(true);
    void refreshActivityLogs(false);
  }, [hasRequestedActivity, isActivityLoading, refreshActivityLogs, tab]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);

    const params = new URLSearchParams({ period });
    if (period === "monthly") params.set("month", month);
    else params.set("date", date);

    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="admin-flat-page">
      <section className="admin-section">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="admin-page-title">통계 / 보고서</h1>
            <p className="admin-page-description">
              출결 추이, 학생 요약, 관리자 활동 로그를 기간별로 확인합니다.
            </p>
          </div>
        </div>

        {/* DESIGN.md 5.4 — 화면 이동은 1차 폴더 탭 */}
        <AdminTabs
          items={REPORT_TABS}
          activeId={tab}
          onChange={setTab}
          label="보고서 화면"
          idPrefix="report-view"
        />

        {tab === "report" ? (
          <div role="tabpanel" id="report-view-panel-report" aria-labelledby="report-view-report">
            <form
              onSubmit={handleSubmit}
              className="mt-6 grid gap-4 xl:grid-cols-[180px_180px_180px_auto]"
            >
              <label className="block">
                <span className="admin-label mb-2 block">보고서 유형</span>
                <select
                  value={period}
                  onChange={(event) => setPeriod(event.target.value as ReportSelection["period"])}
                  className="w-full"
                >
                  <option value="daily">일간</option>
                  <option value="weekly">주간</option>
                  <option value="monthly">월간</option>
                </select>
              </label>

              {period === "monthly" ? (
                <label className="block">
                  <span className="admin-label mb-2 block">기준 월</span>
                  <input
                    type="month"
                    value={month}
                    onChange={(event) => setMonth(event.target.value)}
                    className="w-full"
                  />
                </label>
              ) : (
                <label className="block">
                  <span className="admin-label mb-2 block">
                    {period === "weekly" ? "기준 일자" : "기준 날짜"}
                  </span>
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="w-full"
                  />
                </label>
              )}

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="admin-button admin-button-primary"
                >
                  {isLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                  조회
                </button>
              </div>

              <div className="flex flex-wrap items-end gap-2 xl:justify-end">
                {reportButtons.map((button) => (
                  <Link
                    key={button.label}
                    href={button.href}
                    prefetch={false}
                    className="admin-button"
                  >
                    <Download className="h-4 w-4" />
                    {button.label}
                  </Link>
                ))}
              </div>
            </form>

            {flags.examManagement && <ExamAnalysisExport key={divisionSlug} divisionSlug={divisionSlug} />}

            <section className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">{data.title}</p>
              <p className="mt-1">{data.subtitle}</p>
              <p className="mt-2 text-slate-600">기준 범위: {data.rangeLabel}</p>
            </section>

            {showTrend || showPointMovers ? (
              <div className="mt-6 grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
                {showTrend ? (
                  <section className="admin-section">
                    <h2 className="admin-section-title">
                      {data.period === "daily" ? "교시별 출결 흐름" : "출결률 추이"}
                    </h2>
                    <div className="mt-5 h-[320px] rounded-lg border border-slate-200 bg-white p-4">
                      <ReportsTrendChart color={data.division.color} trend={data.trend} />
                    </div>
                  </section>
                ) : (
                  <div className="admin-help px-5 py-10 text-center">
                    출결 관리 기능이 꺼져 있어 출결 추이 섹션이 숨겨집니다.
                  </div>
                )}

                {showPointMovers ? (
                  <section className="admin-section">
                    <h2 className="admin-section-title">상벌점 변동</h2>
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <article className="admin-section">
                        <p className="admin-help">상위 5명</p>
                        <div className="mt-3 space-y-3">
                          {data.pointMovers.top.length > 0 ? (
                            data.pointMovers.top.map((item) => (
                              <div
                                key={item.studentId}
                                className="flex items-center justify-between gap-3"
                              >
                                <div>
                                  <p className="font-medium text-slate-900">{item.studentName}</p>
                                  <p className="admin-help">{item.studentNumber}</p>
                                </div>
                                <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                  {formatPointDelta(item.pointDelta)}
                                </span>
                              </div>
                            ))
                          ) : (
                            <p className="admin-help">가산점 변동 기록이 없습니다.</p>
                          )}
                        </div>
                      </article>

                      <article className="admin-section">
                        <p className="admin-help">하위 5명</p>
                        <div className="mt-3 space-y-3">
                          {data.pointMovers.bottom.length > 0 ? (
                            data.pointMovers.bottom.map((item) => (
                              <div
                                key={item.studentId}
                                className="flex items-center justify-between gap-3"
                              >
                                <div>
                                  <p className="font-medium text-slate-900">{item.studentName}</p>
                                  <p className="admin-help">{item.studentNumber}</p>
                                </div>
                                <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700">
                                  {formatPointDelta(item.pointDelta)}
                                </span>
                              </div>
                            ))
                          ) : (
                            <p className="admin-help">벌점 변동 기록이 없습니다.</p>
                          )}
                        </div>
                      </article>
                    </div>
                  </section>
                ) : (
                  <div className="admin-help px-5 py-10 text-center">
                    상벌점 관리 기능이 꺼져 있어 점수 변동 요약은 숨겨집니다.
                  </div>
                )}
              </div>
            ) : null}

            {showDailyTable ? (
              <section className="admin-section mt-6">
                <h2 className="admin-section-title">교시별 출결 현황</h2>
                <div className="admin-table-frame mt-5 overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th>교시</th>
                        <th>출결률</th>
                        <th>출석</th>
                        <th>지각</th>
                        <th>결석</th>
                        <th>사유</th>
                        <th>미처리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.dailyPeriodRows.length > 0 ? (
                        data.dailyPeriodRows.map((row) => (
                          <tr key={row.periodId}>
                            <td>
                              <p className="font-medium text-slate-900">{row.periodName}</p>
                              <p className="admin-help mt-1">
                                {row.label || "기본 교시"}
                              </p>
                            </td>
                            <td>
                              {row.attendanceRate}%
                            </td>
                            <td>{row.counts.present}</td>
                            <td>{row.counts.tardy}</td>
                            <td>{row.counts.absent}</td>
                            <td>
                              {row.counts.excused + row.counts.holiday + row.counts.halfHoliday}
                            </td>
                            <td>{row.counts.unprocessed}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="admin-help px-3 py-8 text-center">
                            표시할 교시별 출결 데이터가 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {showRanking ? (
              <section className="admin-section mt-6">
                <h2 className="admin-section-title">학생별 기간 요약</h2>
                <div className="admin-table-frame mt-5 overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th>학생</th>
                        {flags.attendanceManagement ? (
                          <>
                            <th>출결률</th>
                            <th>출석</th>
                            <th>지각</th>
                            <th>결석</th>
                          </>
                        ) : null}
                        {flags.pointManagement ? (
                          <>
                            <th>점수 변동</th>
                            <th>{data.studentRows.some((r) => r.meritPoints !== undefined) ? "상점·벌점" : "누적 점수"}</th>
                          </>
                        ) : null}
                        {flags.warningManagement ? (
                          <th>경고 단계</th>
                        ) : null}
                        {flags.examManagement ? (
                          <th>최근 시험</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {data.studentRows.length > 0 ? (
                        data.studentRows.map((row) => (
                          <tr key={row.studentId}>
                            <td className="admin-table-name">
                              <p className="font-medium text-slate-900">{row.studentName}</p>
                              <p className="admin-help mt-1">
                                {row.studentNumber}
                                {flags.seatManagement
                                  ? ` · 좌석 ${row.seatLabel || "미배정"}`
                                  : ""}
                              </p>
                            </td>
                            {flags.attendanceManagement ? (
                              <>
                                <td>
                                  {row.attendanceRate}%
                                </td>
                                <td>{row.presentCount}</td>
                                <td>{row.tardyCount}</td>
                                <td>
                                  {row.absentCount + row.excusedCount}
                                </td>
                              </>
                            ) : null}
                            {flags.pointManagement ? (
                              <>
                                <td>
                                  <span
                                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${ row.pointDelta > 0 ? "border border-slate-200 bg-white text-emerald-700" : row.pointDelta < 0 ? "border border-slate-200 bg-white text-rose-700" : "bg-slate-100 text-slate-700" }`}
                                  >
                                    {formatPointDelta(row.pointDelta)}
                                  </span>
                                </td>
                                <td>{row.meritPoints !== undefined ? `상점 ${row.meritPoints} / 벌점 ${row.demeritPoints ?? 0}` : `${row.netPoints}점`}</td>
                              </>
                            ) : null}
                            {flags.warningManagement ? (
                              <td>
                                {row.warningStageLabel ?? getWarningStageLabel(row.warningStage)}
                              </td>
                            ) : null}
                            {flags.examManagement ? (
                              <td>
                                {row.latestExamLabel
                                  ? `${formatExamDateLabel(row.latestExamLabel)} / ${row.latestExamTotal ?? "-"}`
                                  : "-"}
                              </td>
                            ) : null}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={rankingColSpan}
                            className="admin-help px-3 py-8 text-center"
                          >
                            표시할 학생 데이터가 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : (
              <div className="admin-help mt-6 px-5 py-10 text-center">
                출결, 상벌점, 경고, 시험, 좌석 기능이 모두 비활성화되어 보고서 본문이 비어
                있습니다.
              </div>
            )}
          </div>
        ) : (
          <div role="tabpanel" id="report-view-panel-activity" aria-labelledby="report-view-activity">
            <div className="mt-6 grid gap-4 xl:grid-cols-[180px_180px_180px_auto]">
              <label className="block">
                <span className="admin-label mb-2 block">조회 시작일</span>
                <input
                  type="date"
                  value={activityDateFrom}
                  onChange={(event) => setActivityDateFrom(event.target.value)}
                  className="w-full"
                />
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">조회 종료일</span>
                <input
                  type="date"
                  value={activityDateTo}
                  onChange={(event) => setActivityDateTo(event.target.value)}
                  className="w-full"
                />
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">처리자</span>
                <select
                  value={activityActorId}
                  onChange={(event) => setActivityActorId(event.target.value)}
                  className="w-full"
                >
                  <option value="ALL">전체</option>
                  {activity.actorOptions.map((actor) => (
                    <option key={actor.id} value={actor.id}>
                      {actor.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="admin-label mb-2 block">액션 유형</span>
                <select
                  value={activityActionType}
                  onChange={(event) =>
                    setActivityActionType(event.target.value as ActivityActionType | "ALL")
                  }
                  className="w-full"
                >
                  <option value="ALL">전체</option>
                  {availableActivityActionOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-end gap-2 xl:justify-end">
                <button
                  type="button"
                  onClick={() => void refreshActivityLogs(true)}
                  disabled={isActivityLoading}
                  className="admin-button"
                >
                  {isActivityLoading ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                  조회
                </button>
                {activity.availableActionTypes.length > 0 ? (
                  <Link
                    href={exportLinks.activity}
                    prefetch={false}
                    className="admin-button"
                  >
                    <Download className="h-4 w-4" />
                    활동 로그 내보내기
                  </Link>
                ) : null}
              </div>
            </div>

            <section className="admin-section mt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="admin-section-title">관리자 활동 로그</h2>
                </div>
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  총 {activity.items.length}건
                </span>
              </div>

              {activity.availableActionTypes.length === 0 ? (
                <div className="admin-help mt-5 px-5 py-10 text-center">
                  상벌점, 출결 수정, 학생 상태, 면담 기능이 모두 비활성화되어 활동 로그가 없습니다.
                </div>
              ) : (
                <div className="admin-table-frame mt-5 overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th>시각</th>
                        <th>유형</th>
                        <th>학생</th>
                        <th>처리자</th>
                        <th>내용</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activity.items.length > 0 ? (
                        activity.items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              {formatDateTime(item.occurredAt)}
                            </td>
                            <td>
                              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                {item.actionLabel}
                              </span>
                            </td>
                            <td className="admin-table-name">
                              <p className="font-medium text-slate-900">{item.studentName}</p>
                              <p className="admin-help mt-1">{item.studentNumber}</p>
                            </td>
                            <td>{item.actorName}</td>
                            <td>{item.detail}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="admin-help px-3 py-8 text-center">
                            조건에 맞는 활동 로그가 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
