import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { MonthlyResultsSheet } from "@/components/analytics/monthly-results-sheet";
import { PrintButton } from "@/components/ui/print-button";
import { getIntegratedResults } from "@/lib/analytics/service";
import { buildHref, getAnalyticsContext, readStringParam } from "@/lib/analytics/ui";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AdminIntegratedResultsPage({ searchParams }: PageProps) {
  const [, { periods, selectedPeriod, examType }] = await Promise.all([
    requireAdminContext(AdminRole.VIEWER),
    getAnalyticsContext(searchParams),
  ]);
  const view = readStringParam(searchParams, "view") === "new" ? "new" : "overall";
  const data = selectedPeriod
    ? await getIntegratedResults(selectedPeriod.id, examType, view, {
        includeRankingRows: false,
      })
    : null;
  const downloadHref = selectedPeriod
    ? buildHref("/api/export/results-print", {
        mode: "integrated",
        periodId: selectedPeriod.id,
        examType,
        view,
      })
    : null;
  const printTitle = selectedPeriod
    ? `${selectedPeriod.name} · ${view === "new" ? "신규생 전체 성적표" : "전체 성적표"}`
    : undefined;

  return (
    <div className="p-8 sm:p-10">
      <div className="no-print">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          F-07 Integrated Results
        </div>
        <h1 className="mt-5 text-3xl font-semibold">전체 성적 / 석차표</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
          시험 기간 전체 범위를 기준으로 누적 성적표를 확인하고, 인쇄용 표도 바로 내려받을 수 있습니다.
        </p>

        <form className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-3">
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

      {selectedPeriod && data ? (
        <>
          <div className="no-print mt-6 flex flex-wrap gap-3">
            <Link
              prefetch={false}
              href={buildHref("/admin/results/integrated", {
                periodId: selectedPeriod.id,
                examType,
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
              href={buildHref("/admin/results/integrated", {
                periodId: selectedPeriod.id,
                examType,
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
              rows={data.sheetRows}
              title="전체 누적 성적표"
              subtitle={selectedPeriod.name}
              className="print-title"
              printTitle={printTitle}
            />
          </div>
        </>
      ) : (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-sm text-slate">
          조회 조건을 선택하면 전체 성적표가 표시됩니다.
        </div>
      )}
    </div>
  );
}
