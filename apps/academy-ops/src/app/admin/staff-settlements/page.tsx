import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SettlementTable } from "./settlement-table";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function parseMonthParam(
  monthParam: string | string[] | undefined
): { year: number; month: number } {
  const raw = Array.isArray(monthParam) ? monthParam[0] : monthParam;
  const today = new Date();
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (y >= 2020 && m >= 1 && m <= 12) {
      return { year: y, month: m };
    }
  }
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

function formatYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function prevMonth(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function nextMonth(year: number, month: number) {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

export default async function StaffSettlementsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const sp = searchParams ? await searchParams : {};
  const { year, month } = parseMonthParam(sp.month);

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0, 23, 59, 59, 999);

  // Get all active staff with linked AdminUser
  const staffList = await getPrisma().staff.findMany({
    where: { isActive: true, adminUserId: { not: null } },
    select: {
      id: true,
      name: true,
      role: true,
      adminUserId: true,
    },
    orderBy: { name: "asc" },
  });

  const adminUserIds = staffList
    .map((s) => s.adminUserId)
    .filter((id): id is string => id !== null);

  // Aggregate payments grouped by processedBy
  const paymentAggregates =
    adminUserIds.length > 0
      ? await getPrisma().payment.groupBy({
          by: ["processedBy"],
          where: {
            processedBy: { in: adminUserIds },
            processedAt: { gte: firstDay, lte: lastDay },
            status: { notIn: ["CANCELLED"] },
          },
          _count: { id: true },
          _sum: { netAmount: true },
        })
      : [];

  const aggregateMap = new Map(
    paymentAggregates.map((agg) => [
      agg.processedBy,
      { count: agg._count.id, total: agg._sum.netAmount ?? 0 },
    ])
  );

  const settlements = staffList.map((staff) => {
    const adminId = staff.adminUserId ?? "";
    const agg = aggregateMap.get(adminId);
    return {
      staffId: staff.id,
      staffName: staff.name,
      staffRole: staff.role as string,
      adminUserId: adminId,
      paymentCount: agg?.count ?? 0,
      totalRevenue: agg?.total ?? 0,
    };
  });

  const currentMonthStr = formatYearMonth(year, month);
  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);
  const today = new Date();
  const isNextFuture =
    next.year > today.getFullYear() ||
    (next.year === today.getFullYear() && next.month > today.getMonth() + 1);

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        직원 관리
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">직원 정산</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            직원별 월 수납 처리 건수와 총액을 기준으로 배분율을 입력하여 정산 금액을 확인합니다.
            배분율은 수동 입력이며 저장되지 않습니다. 엑셀 다운로드 시 입력된 배분율이 반영됩니다.
          </p>
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/staff-settlements?month=${formatYearMonth(prev.year, prev.month)}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-white text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
            aria-label="이전 달"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <span className="min-w-[80px] text-center text-sm font-medium text-ink">
            {year}년 {month}월
          </span>
          {isNextFuture ? (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white/50 text-slate/40 cursor-not-allowed">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </span>
          ) : (
            <Link
              href={`/admin/staff-settlements?month=${formatYearMonth(next.year, next.month)}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/15 bg-white text-slate shadow-sm transition hover:border-forest/30 hover:text-forest"
              aria-label="다음 달"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      {/* Quick links */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/dashboard/staff-workload"
          className="inline-flex items-center gap-2 rounded-full border border-ember/20 bg-ember/10 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/20"
        >
          직원 부하 현황 →
        </Link>
        <Link
          href="/admin/dashboard/staff-performance"
          className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/10 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/20"
        >
          직원 실적 →
        </Link>
      </div>

      {/* Period summary badge */}
      <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-medium text-forest">
        <span>
          {year}년 {month}월 정산
        </span>
      </div>

      {/* Main content */}
      <div className="mt-8">
        <SettlementTable
          year={year}
          month={month}
          currentMonthStr={currentMonthStr}
          settlements={settlements}
        />
      </div>
    </div>
  );
}
