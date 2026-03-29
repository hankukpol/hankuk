import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const EXAM_CATEGORY_LABEL: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
  SOGANG: "소강",
  CUSTOM: "기타",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  ACTIVE: "활성",
  WAITING: "대기번호",
  SUSPENDED: "휴원",
  COMPLETED: "수료",
  WITHDRAWN: "퇴원",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "text-slate",
  ACTIVE: "text-green-700",
  WAITING: "text-amber-700",
  SUSPENDED: "text-blue-700",
  COMPLETED: "text-forest",
  WITHDRAWN: "text-red-600",
};

type SearchParams = { month?: string };

export default async function EnrollmentStatusReportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const sp = await searchParams;
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthStr = sp.month ?? defaultMonth;

  // Parse month to date range
  const [yearStr, monthNumStr] = monthStr.split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthNumStr);
  const rangeStart = new Date(year, monthNum - 1, 1);
  const rangeEnd = new Date(year, monthNum, 1);

  const db = getPrisma();

  // Get all cohorts active as of this month (created before monthEnd)
  const cohorts = await db.cohort.findMany({
    where: {
      createdAt: { lt: rangeEnd },
    },
    orderBy: [{ examCategory: "asc" }, { startDate: "desc" }],
    select: {
      id: true,
      name: true,
      examCategory: true,
      startDate: true,
      endDate: true,
      isActive: true,
      maxCapacity: true,
    },
  });

  // For each cohort, count enrollments by status (as of month-end snapshot)
  // We use current status (best available without history tables)
  const enrollmentStats = await db.courseEnrollment.groupBy({
    by: ["cohortId", "status"],
    where: {
      cohortId: { in: cohorts.map((c) => c.id) },
      createdAt: { lt: rangeEnd },
    },
    _count: { id: true },
  });

  // Build lookup: cohortId -> status -> count
  const statsByCohort = new Map<
    string,
    Record<string, number>
  >();

  for (const row of enrollmentStats) {
    if (!row.cohortId) continue;
    const existing = statsByCohort.get(row.cohortId) ?? {};
    existing[row.status] = row._count.id;
    statsByCohort.set(row.cohortId, existing);
  }

  const statuses = ["ACTIVE", "PENDING", "WAITING", "SUSPENDED", "COMPLETED", "WITHDRAWN"] as const;

  // Grand totals
  const grandTotals: Record<string, number> = {};
  for (const s of statuses) grandTotals[s] = 0;
  let grandTotal = 0;

  for (const cohort of cohorts) {
    const stats = statsByCohort.get(cohort.id) ?? {};
    for (const s of statuses) {
      grandTotals[s] = (grandTotals[s] ?? 0) + (stats[s] ?? 0);
    }
    grandTotal += statuses.reduce((sum, s) => sum + (stats[s] ?? 0), 0);
  }

  // Month navigation helpers
  const prevDate = new Date(year, monthNum - 2, 1);
  const nextDate = new Date(year, monthNum, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
  const isCurrentMonth = monthStr === defaultMonth;

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/reports" className="transition hover:text-ember">
          보고서 센터
        </Link>
        <span>/</span>
        <span className="font-semibold text-ink">수강생 현황 보고서</span>
      </div>

      {/* Header */}
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            수강생 현황
          </div>
          <h1 className="mt-3 text-3xl font-semibold">수강생 현황 보고서</h1>
          <p className="mt-2 text-sm text-slate">
            반별 수강생 등록 상태 분포를 조회합니다.
          </p>
        </div>
        <Link
          href="/admin/reports"
          className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/30"
        >
          ← 보고서 센터
        </Link>
      </div>

      {/* Month filter + export */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/reports/enrollment-status?month=${prevMonth}`}
          className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1.5 text-sm text-ink transition hover:border-ink/30"
        >
          ← 이전달
        </Link>
        <span className="text-base font-semibold text-ink">
          {year}년 {monthNum}월
        </span>
        <Link
          href={`/admin/reports/enrollment-status?month=${nextMonth}`}
          className={`inline-flex items-center rounded-full border border-ink/10 px-3 py-1.5 text-sm transition hover:border-ink/30 ${
            isCurrentMonth ? "cursor-not-allowed text-slate/40" : "text-ink"
          }`}
        >
          다음달 →
        </Link>
        <div className="ml-auto">
          <a
            href={`/api/reports/enrollment-status?month=${monthStr}`}
            className="inline-flex items-center gap-2 rounded-full bg-forest px-4 py-2 text-sm font-medium text-white transition hover:bg-forest/90"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Excel 내보내기
          </a>
        </div>
      </div>

      {/* KPI row */}
      <div className="mt-6 grid grid-cols-3 gap-4 sm:grid-cols-6">
        {statuses.map((s) => (
          <div key={s} className="rounded-[20px] border border-ink/10 bg-white px-4 py-4">
            <p className="text-xs font-medium text-slate">{STATUS_LABEL[s]}</p>
            <p className={`mt-1.5 text-2xl font-bold tabular-nums ${STATUS_COLORS[s]}`}>
              {grandTotals[s].toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-end">
        <p className="text-sm text-slate">
          전체 합계:{" "}
          <span className="font-semibold text-ink">{grandTotal.toLocaleString()}명</span>
        </p>
      </div>

      {/* Table */}
      {cohorts.length === 0 ? (
        <div className="mt-6 rounded-[28px] border border-ink/10 bg-white px-6 py-12 text-center text-sm text-slate">
          해당 기간에 등록된 수강반이 없습니다.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-[28px] border border-ink/10 bg-white">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead>
              <tr>
                <th className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  수강반
                </th>
                <th className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  카테고리
                </th>
                {statuses.map((s) => (
                  <th
                    key={s}
                    className="bg-mist/50 px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-slate"
                  >
                    {STATUS_LABEL[s]}
                  </th>
                ))}
                <th className="bg-mist/50 px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-slate">
                  합계
                </th>
                <th className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  정원
                </th>
                <th className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate">
                  상태
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {cohorts.map((cohort) => {
                const stats = statsByCohort.get(cohort.id) ?? {};
                const rowTotal = statuses.reduce((sum, s) => sum + (stats[s] ?? 0), 0);
                const activeCount = stats["ACTIVE"] ?? 0;
                const capacity = cohort.maxCapacity;
                const utilizationPct =
                  capacity && capacity > 0
                    ? Math.round((activeCount / capacity) * 100)
                    : null;

                return (
                  <tr key={cohort.id} className="transition hover:bg-mist/30">
                    <td className="px-4 py-3 font-medium text-ink">
                      {cohort.name}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">
                        {EXAM_CATEGORY_LABEL[cohort.examCategory] ?? cohort.examCategory}
                      </span>
                    </td>
                    {statuses.map((s) => (
                      <td
                        key={s}
                        className={`px-4 py-3 text-center tabular-nums ${
                          (stats[s] ?? 0) > 0
                            ? STATUS_COLORS[s] + " font-semibold"
                            : "text-slate/30"
                        }`}
                      >
                        {stats[s] ?? 0}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center tabular-nums font-semibold text-ink">
                      {rowTotal}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate">
                      {capacity ? (
                        <span>
                          {capacity}명{" "}
                          {utilizationPct !== null && (
                            <span
                              className={
                                utilizationPct >= 100
                                  ? "font-semibold text-red-600"
                                  : utilizationPct >= 80
                                    ? "text-amber-600"
                                    : "text-green-700"
                              }
                            >
                              ({utilizationPct}%)
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate/40">무제한</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          cohort.isActive
                            ? "bg-green-50 text-green-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {cohort.isActive ? "운영중" : "종료"}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {/* Grand total row */}
              <tr className="bg-mist/40">
                <td className="px-4 py-3 font-semibold text-ink" colSpan={2}>
                  합계
                </td>
                {statuses.map((s) => (
                  <td
                    key={s}
                    className={`px-4 py-3 text-center tabular-nums font-semibold ${STATUS_COLORS[s]}`}
                  >
                    {grandTotals[s]}
                  </td>
                ))}
                <td className="px-4 py-3 text-center tabular-nums font-bold text-ink">
                  {grandTotal}
                </td>
                <td className="px-4 py-3" colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Note */}
      <p className="mt-4 text-xs text-slate">
        * 수강생 현황은 해당 월 말일 기준 생성된 수강 등록 건의 현재 상태를 표시합니다.
        상태 이력 추적이 필요하면 수강 목록에서 직접 조회하세요.
      </p>
    </div>
  );
}
