import { AdminRole, PointType } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PointsDashboard } from "./points-manager";

export const dynamic = "force-dynamic";

const POINT_TYPE_LABEL: Record<PointType, string> = {
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

export type PointLogRow = {
  id: number;
  examNumber: string;
  studentName: string;
  studentMobile: string | null;
  type: PointType;
  amount: number;
  reason: string;
  grantedAt: string;
  grantedBy: string | null;
};

export type PointsKpi = {
  totalIssued: number;
  thisMonthIssued: number;
  totalBalance: number;
  beneficiaryCount: number;
};

export default async function AdminPointsPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [totalIssuedAgg, thisMonthIssuedAgg, totalBalanceAgg, beneficiaryGroups, recentLogs] =
    await Promise.all([
      prisma.pointLog.aggregate({
        where: { amount: { gt: 0 } },
        _sum: { amount: true },
      }),
      prisma.pointLog.aggregate({
        where: { amount: { gt: 0 }, grantedAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      prisma.pointLog.aggregate({ _sum: { amount: true } }),
      prisma.pointLog.groupBy({
        by: ["examNumber"],
        where: { amount: { gt: 0 } },
        _count: true,
      }),
      prisma.pointLog.findMany({
        orderBy: { grantedAt: "desc" },
        take: 10,
        include: {
          student: { select: { name: true, phone: true } },
        },
      }),
    ]);

  const kpi: PointsKpi = {
    totalIssued: totalIssuedAgg._sum.amount ?? 0,
    thisMonthIssued: thisMonthIssuedAgg._sum.amount ?? 0,
    totalBalance: totalBalanceAgg._sum.amount ?? 0,
    beneficiaryCount: beneficiaryGroups.length,
  };

  const logs: PointLogRow[] = recentLogs.map((log) => ({
    id: log.id,
    examNumber: log.examNumber,
    studentName: log.student.name,
    studentMobile: log.student.phone,
    type: log.type,
    amount: log.amount,
    reason: log.reason,
    grantedAt: log.grantedAt.toISOString(),
    grantedBy: log.grantedBy,
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
            Points
          </div>
          <h1 className="mt-5 text-3xl font-semibold">포인트 현황</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            전체 포인트 발행 현황과 최근 지급 이력을 확인하고, 수동으로 포인트를 지급합니다.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/admin/points/grant"
            className="inline-flex items-center gap-2 rounded-full border border-ember/30 bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90"
          >
            포인트 지급
          </Link>
          <Link
            href="/admin/points/leaderboard"
            className="inline-flex items-center gap-2 rounded-full border border-ember/30 bg-ember/10 px-4 py-2 text-sm font-medium text-ember transition hover:bg-ember/20"
          >
            리더보드
          </Link>
          <Link
            href="/admin/points/attendance"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
          >
            개근 포인트 관리
          </Link>
          <Link
            href="/admin/points/manage"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
          >
            포인트 직접 관리
          </Link>
          <Link
            href="/admin/points/policies"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
          >
            지급 정책
          </Link>
        </div>
      </div>

      <PointsDashboard kpi={kpi} initialLogs={logs} pointTypeLabelMap={POINT_TYPE_LABEL} />
    </div>
  );
}
