import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { WeeklyResultsSheet } from "@/components/analytics/weekly-results-sheet";
import { PrintButton } from "@/components/ui/print-button";
import {
  buildHref,
  getAnalyticsContext,
  getWeekOptions,
  readStringParam,
} from "@/lib/analytics/ui";
import { getTuesdayWeekKey } from "@/lib/analytics/week";
import { requireAdminContext } from "@/lib/auth";
import { getWeeklyResults } from "@/lib/analytics/service";
import { EXAM_TYPE_LABEL, getSubjectDisplayLabel } from "@/lib/constants";
import { buildSessionDisplayColumns } from "@/lib/exam-session-rules";
import { formatDateWithWeekday } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AdminWeeklyResultsPage({ searchParams }: PageProps) {
  const [, { periods, selectedPeriod, examType }] = await Promise.all([
    requireAdminContext(AdminRole.VIEWER),
    getAnalyticsContext(searchParams),
  ]);
  const weekOptions = getWeekOptions(selectedPeriod, examType);
  const requestedWeekKey = readStringParam(searchParams, "weekKey");
  const selectedWeek =
    weekOptions.find((option) => option.key === requestedWeekKey) ??
    weekOptions.find((option) => option.key === getTuesdayWeekKey(new Date())) ??
    weekOptions[weekOptions.length - 1] ??
    null;
  const view = readStringParam(searchParams, "view") === "new" ? "new" : "overall";

  // Find previous week (the week before selected in weekOptions)
  const selectedWeekIndex = selectedWeek
    ? weekOptions.findIndex((w) => w.key === selectedWeek.key)
    : -1;
  const prevWeek =
    selectedWeekIndex > 0 ? weekOptions[selectedWeekIndex - 1] : null;

  const [data, prevData] = await Promise.all([
    selectedPeriod && selectedWeek
      ? getWeeklyResults(selectedPeriod.id, examType, selectedWeek.key, view, {
          includeRankingRows: false,
        })
      : Promise.resolve(null),
    selectedPeriod && prevWeek
      ? getWeeklyResults(selectedPeriod.id, examType, prevWeek.key, view, {
          includeRankingRows: false,
        })
      : Promise.resolve(null),
  ]);

  // Build prev-week mockAverage lookup
  const prevMockAvgByExamNumber = new Map<string, number>();
  if (prevData) {
    for (const row of prevData.sheetRows) {
      if (row.mockAverage > 0) {
        prevMockAvgByExamNumber.set(row.examNumber, row.mockAverage);
      }
    }
  }

  // Inject delta into current rows
  const sheetRowsWithDelta = data
    ? data.sheetRows.map((row) => {
        const prevAvg = prevMockAvgByExamNumber.get(row.examNumber);
        return {
          ...row,
          mockAverageDelta:
            prevAvg !== undefined && row.mockAverage > 0
              ? Math.round((row.mockAverage - prevAvg) * 10) / 10
              : null,
        };
      })
    : [];

  const downloadHref =
    selectedPeriod && selectedWeek
      ? buildHref("/api/export/results-print", {
          mode: "weekly",
          periodId: selectedPeriod.id,
          examType,
          weekKey: selectedWeek.key,
          view,
        })
      : null;
  const displayColumns = data ? buildSessionDisplayColumns(data.sessions) : [];
  const printTitle =
    selectedPeriod && selectedWeek
      ? `${selectedPeriod.name} · ${selectedWeek.label} · ${view === "new" ? "신규생 주간 성적표" : "주간 성적표"}`
      : undefined;

  return (
    <div className="p-8 sm:p-10">
      <div className="no-print">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          F-05-B Weekly Results
        </div>
        <h1 className="mt-5 text-3xl font-semibold">주간 성적 / 출감표</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
          선택한 시험 기간과 주차를 기준으로 주간 성적표를 확인하고, 인쇄용 표도 바로 내려받을 수 있습니다.
          모의고사 평균 열에 전 주차 대비 ▲▼ 변화 배지가 함께 표시됩니다.
        </p>

        <form className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium">시험 기간</label>
            <select
              name="periodId"
              defaultValue={selectedPeriod?.id ? String(selectedPeriod.id) : ""}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">직렬</label>
            <select
              name="examType"
              defaultValue={examType}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
              <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">주차</label>
            <select
              name="weekKey"
              defaultValue={selectedWeek?.key ?? ""}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {weekOptions.map((week) => (
                <option key={week.key} value={week.key}>
                  {week.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
            >
              조회
            </button>
          </div>
        </form>
      </div>

      {selectedPeriod && selectedWeek && data ? (
        <>
          <div className="no-print mt-6 flex flex-wrap gap-3">
            <Link
              prefetch={false}
              href={buildHref("/admin/results/weekly", {
                periodId: selectedPeriod.id,
                examType,
                weekKey: selectedWeek.key,
                view: "overall",
              })}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                view === "overall"
                  ? "bg-ink text-white"
                  : "border border-ink/10 text-ink hover:border-ember/30 hover:text-ember"
              }`}
            >
              전체 성적
            </Link>
            <Link
              prefetch={false}
              href={buildHref("/admin/results/weekly", {
                periodId: selectedPeriod.id,
                examType,
                weekKey: selectedWeek.key,
                view: "new",
              })}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                view === "new"
                  ? "bg-ink text-white"
                  : "border border-ink/10 text-ink hover:border-ember/30 hover:text-ember"
              }`}
            >
              신규생 성적
            </Link>
            <PrintButton />
            <a
              href={downloadHref ?? undefined}
              className="rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-ink transition hover:border-forest hover:text-forest"
            >
              인쇄용 표 다운로드
            </a>
          </div>

          <section className="no-print mt-6 rounded-[28px] border border-ink/10 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">선택한 주차</h2>
                <p className="mt-2 text-sm text-slate">
                  {data.week.label}
                  {data.week.legacyWeeks.length > 0 ? ` / 기존 week ${data.week.legacyWeeks.join(", ")}` : ""}
                </p>
              </div>
              {prevWeek && (
                <div className="rounded-[16px] border border-ink/10 bg-mist px-4 py-2 text-xs text-slate">
                  <span className="font-medium">비교 기준:</span> {prevWeek.label} (전 주차)
                </div>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate">
              {displayColumns.map((column) => (
                <span key={column.key} className="rounded-full border border-ink/10 px-3 py-2">
                  {formatDateWithWeekday(column.examDate)} · {getSubjectDisplayLabel(column.subject, column.displaySubjectName)}
                  {column.oxSession ? " + 경찰학 OX" : ""}
                </span>
              ))}
            </div>
          </section>

          <div className="mt-8">
            <WeeklyResultsSheet
              week={data.week}
              sessions={data.sessions}
              rows={sheetRowsWithDelta}
              className="print-title"
              printTitle={printTitle}
            />
          </div>
        </>
      ) : (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-sm text-slate">
          조회 조건을 선택하면 해당 주차의 성적표가 표시됩니다.
        </div>
      )}
    </div>
  );
}
