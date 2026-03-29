import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { MonthlyResultsSheet } from "@/components/analytics/monthly-results-sheet";
import { PrintButton } from "@/components/ui/print-button";
import { getMonthlyResults } from "@/lib/analytics/service";
import {
  buildHref,
  getAnalyticsContext,
  getWeekOptions,
  readStringParam,
} from "@/lib/analytics/ui";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AdminMonthlyResultsPage({ searchParams }: PageProps) {
  const [, { periods, selectedPeriod, examType }] = await Promise.all([
    requireAdminContext(AdminRole.VIEWER),
    getAnalyticsContext(searchParams),
  ]);
  const weekOptions = getWeekOptions(selectedPeriod, examType);

  const requestedFromWeekKey = readStringParam(searchParams, "fromWeekKey");
  const requestedToWeekKey = readStringParam(searchParams, "toWeekKey");

  const fromWeekKey =
    weekOptions.find((week) => week.key === requestedFromWeekKey)?.key ?? weekOptions[0]?.key;
  const toWeekKey =
    weekOptions.find((week) => week.key === requestedToWeekKey)?.key ??
    weekOptions[weekOptions.length - 1]?.key;

  const view = readStringParam(searchParams, "view") === "new" ? "new" : "overall";
  const data =
    selectedPeriod && fromWeekKey && toWeekKey
      ? await getMonthlyResults(selectedPeriod.id, examType, fromWeekKey, toWeekKey, view, {
          includeRankingRows: false,
        })
      : null;

  const fromLabel = weekOptions.find((week) => week.key === fromWeekKey)?.label ?? "";
  const toLabel = weekOptions.find((week) => week.key === toWeekKey)?.label ?? "";
  const rangeLabel = fromLabel && toLabel ? `${fromLabel} ~ ${toLabel}` : "";
  const downloadHref =
    selectedPeriod && fromWeekKey && toWeekKey
      ? buildHref("/api/export/results-print", {
          mode: "monthly",
          periodId: selectedPeriod.id,
          examType,
          fromWeekKey,
          toWeekKey,
          view,
        })
      : null;
  const printTitle =
    selectedPeriod && rangeLabel
      ? `${selectedPeriod.name} · ${rangeLabel} · ${view === "new" ? "신규생 기간 성적표" : "기간 성적표"}`
      : undefined;

  return (
    <div className="p-8 sm:p-10">
      <div className="no-print">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          F-06 Monthly Results
        </div>
        <h1 className="mt-5 text-3xl font-semibold">기간 성적 / 석차표</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
          시작 주차와 종료 주차를 기준으로 누적 성적표를 확인하고, 인쇄용 표도 바로 내려받을 수 있습니다.
        </p>

        <form className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-5">
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
            <label className="mb-2 block text-sm font-medium">시작 주차</label>
            <select
              name="fromWeekKey"
              defaultValue={fromWeekKey ?? ""}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {weekOptions.length === 0 && <option value="">주차 없음</option>}
              {weekOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">종료 주차</label>
            <select
              name="toWeekKey"
              defaultValue={toWeekKey ?? ""}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {weekOptions.length === 0 && <option value="">주차 없음</option>}
              {weekOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
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

      {selectedPeriod && fromWeekKey && toWeekKey && data ? (
        <>
          <div className="no-print mt-6 flex flex-wrap gap-3">
            <Link
              prefetch={false}
              href={buildHref("/admin/results/monthly", {
                periodId: selectedPeriod.id,
                examType,
                fromWeekKey,
                toWeekKey,
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
              href={buildHref("/admin/results/monthly", {
                periodId: selectedPeriod.id,
                examType,
                fromWeekKey,
                toWeekKey,
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

          <div className="mt-8">
            <MonthlyResultsSheet
              subtitle={rangeLabel}
              rows={data.sheetRows}
              className="print-title"
              printTitle={printTitle}
            />
          </div>
        </>
      ) : (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-sm text-slate">
          {weekOptions.length === 0
            ? "조회 가능한 주차가 아직 없습니다."
            : "조회 조건을 선택하면 기간 성적표가 표시됩니다."}
        </div>
      )}
    </div>
  );
}
