import { AdminRole, PointType } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PointsHistory } from "./points-history";

export const dynamic = "force-dynamic";

export const POINT_TYPE_LABEL: Record<PointType, string> = {
  PERFECT_ATTENDANCE: "개근",
  SCORE_EXCELLENCE: "성적 우수",
  ESSAY_EXCELLENCE: "논술 우수",
  MANUAL: "수동 지급",
  USE_PAYMENT: "사용(수강료)",
  USE_RENTAL: "사용(대여)",
  ADJUST: "포인트 조정",
  EXPIRE: "만료",
  REFUND_CANCEL: "취소/환불",
};

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function pick(params: PageProps["searchParams"], key: string): string | undefined {
  const v = params?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export type HistoryLogRow = {
  id: number;
  examNumber: string;
  studentName: string;
  type: PointType;
  amount: number;
  reason: string;
  grantedAt: string;
  grantedBy: string | null;
};

export default async function PointsHistoryPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const q = pick(searchParams, "q")?.trim();
  const typeParam = pick(searchParams, "type")?.trim();
  const monthParam = pick(searchParams, "month")?.trim(); // "YYYY-MM"

  const validTypes = Object.values(PointType) as string[];
  const type =
    typeParam && validTypes.includes(typeParam) ? (typeParam as PointType) : undefined;

  // Build grantedAt date range for month filter
  let grantedAtFilter:
    | { gte: Date; lt: Date }
    | undefined = undefined;
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1); // first day of next month
    grantedAtFilter = { gte: start, lt: end };
  }

  // Build search condition
  type WhereClause = {
    type?: PointType;
    grantedAt?: { gte: Date; lt: Date };
    OR?: Array<
      | { examNumber: { contains: string; mode: "insensitive" } }
      | { student: { name: { contains: string; mode: "insensitive" } } }
    >;
  };

  const where: WhereClause = {
    ...(type ? { type } : {}),
    ...(grantedAtFilter ? { grantedAt: grantedAtFilter } : {}),
    ...(q
      ? {
          OR: [
            { examNumber: { contains: q, mode: "insensitive" as const } },
            { student: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  // KPI data — always from ALL logs (no filter)
  const [totalCountAll, totalPositiveAgg, negativeCountAll, logs] = await Promise.all([
    prisma.pointLog.count(),
    prisma.pointLog.aggregate({
      where: { amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    prisma.pointLog.count({ where: { amount: { lt: 0 } } }),
    prisma.pointLog.findMany({
      where,
      orderBy: { grantedAt: "desc" },
      take: 200,
      include: { student: { select: { name: true } } },
    }),
  ]);

  const totalPositivePoints = totalPositiveAgg._sum.amount ?? 0;

  const rows: HistoryLogRow[] = logs.map((log) => ({
    id: log.id,
    examNumber: log.examNumber,
    studentName: log.student.name,
    type: log.type,
    amount: log.amount,
    reason: log.reason,
    grantedAt: log.grantedAt.toISOString(),
    grantedBy: log.grantedBy ?? null,
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-xs text-slate">
        <Link href="/admin/points" className="hover:text-forest transition-colors">
          포인트 현황
        </Link>
        <span>/</span>
        <span className="text-ink">전체 이력</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            포인트 이력
          </div>
          <h1 className="mt-5 text-3xl font-semibold">포인트 전체 이력</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            전체 포인트 지급·차감 이력을 유형·월·검색어로 필터링하여 조회합니다.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/admin/points/leaderboard"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
          >
            리더보드
          </Link>
          <Link
            href="/admin/points/manage"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
          >
            포인트 직접 관리
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wider text-slate">전체 지급 건수</p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {totalCountAll.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">전체 포인트 로그</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wider text-slate">전체 지급 포인트</p>
          <p className="mt-3 text-3xl font-bold text-forest">
            +{totalPositivePoints.toLocaleString()}P
          </p>
          <p className="mt-1 text-xs text-slate">누적 지급 (양수)</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wider text-slate">전체 차감 건수</p>
          <p className="mt-3 text-3xl font-bold text-ember">
            {negativeCountAll.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">차감 처리 내역</p>
        </div>
      </div>

      {/* History Table with Filters */}
      <PointsHistory
        initialLogs={rows}
        filters={{
          q: q ?? "",
          type: typeParam ?? "",
          month: monthParam ?? "",
        }}
        pointTypeLabelMap={POINT_TYPE_LABEL}
      />
    </div>
  );
}
