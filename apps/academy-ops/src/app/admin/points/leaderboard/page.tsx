import { AdminRole, ExamType, PointType } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_TYPE_LABEL } from "@/lib/constants";

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

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function pick(params: PageProps["searchParams"], key: string): string | undefined {
  const v = params?.[key];
  return Array.isArray(v) ? v[0] : v;
}

type LeaderboardRow = {
  rank: number;
  examNumber: string;
  name: string;
  phone: string | null;
  examType: ExamType;
  balance: number;
};

type RecentLogRow = {
  id: number;
  examNumber: string;
  studentName: string;
  type: PointType;
  amount: number;
  reason: string;
  grantedAt: string;
};

export default async function PointsLeaderboardPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const examTypeParam = pick(searchParams, "examType")?.trim();
  const validExamTypes = Object.values(ExamType) as string[];
  const examTypeFilter =
    examTypeParam && validExamTypes.includes(examTypeParam)
      ? (examTypeParam as ExamType)
      : undefined;

  // Compute per-student balance by summing all PointLog amounts (positive = earned, negative = spent)
  const [balanceGroups, totalIssuedAgg, totalRedeemedAgg, recentLogs] = await Promise.all([
    prisma.pointLog.groupBy({
      by: ["examNumber"],
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
    }),
    prisma.pointLog.aggregate({
      where: { amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    prisma.pointLog.aggregate({
      where: { amount: { lt: 0 } },
      _sum: { amount: true },
    }),
    prisma.pointLog.findMany({
      orderBy: { grantedAt: "desc" },
      take: 20,
      include: { student: { select: { name: true } } },
    }),
  ]);

  // Fetch student details for all examNumbers in balance groups
  const allExamNumbers = balanceGroups.map((g) => g.examNumber);
  const students = await prisma.student.findMany({
    where: {
      examNumber: { in: allExamNumbers },
      isActive: true,
      ...(examTypeFilter ? { examType: examTypeFilter } : {}),
    },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      examType: true,
    },
  });

  const studentMap = new Map(students.map((s) => [s.examNumber, s]));

  // Build leaderboard: join balance groups with student info, filter by examType if needed, take top 50
  const leaderboard: LeaderboardRow[] = [];
  let rank = 0;
  for (const group of balanceGroups) {
    const student = studentMap.get(group.examNumber);
    if (!student) continue; // inactive or filtered out
    const balance = group._sum.amount ?? 0;
    if (balance <= 0) continue; // only show students with positive balance
    rank++;
    leaderboard.push({
      rank,
      examNumber: student.examNumber,
      name: student.name,
      phone: student.phone,
      examType: student.examType,
      balance,
    });
    if (leaderboard.length >= 50) break;
  }

  const totalIssued = totalIssuedAgg._sum.amount ?? 0;
  const totalRedeemed = Math.abs(totalRedeemedAgg._sum.amount ?? 0);
  const activeWithPoints = leaderboard.length;
  const avgBalance =
    activeWithPoints > 0
      ? Math.round(leaderboard.reduce((s, r) => s + r.balance, 0) / activeWithPoints)
      : 0;

  const recentLogRows: RecentLogRow[] = recentLogs.map((log) => ({
    id: log.id,
    examNumber: log.examNumber,
    studentName: log.student.name,
    type: log.type,
    amount: log.amount,
    reason: log.reason,
    grantedAt: log.grantedAt.toISOString(),
  }));

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-xs text-slate">
        <Link href="/admin/points" className="hover:text-forest transition-colors">
          포인트 현황
        </Link>
        <span>/</span>
        <span className="text-ink">포인트 리더보드</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
            포인트 분석
          </div>
          <h1 className="mt-5 text-3xl font-semibold">포인트 리더보드</h1>
          <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
            포인트 잔액 상위 학생 순위와 최근 포인트 지급 내역을 조회합니다.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/admin/points/manage"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
          >
            포인트 직접 관리
          </Link>
          <Link
            href="/admin/points/history"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-mist"
          >
            전체 이력
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/8 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wider text-slate">총 지급 포인트</p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {totalIssued.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">누적 지급</p>
        </div>
        <div className="rounded-[28px] border border-ink/8 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wider text-slate">총 사용 포인트</p>
          <p className="mt-3 text-3xl font-bold text-ember">
            {totalRedeemed.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">누적 차감</p>
        </div>
        <div className="rounded-[28px] border border-ink/8 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wider text-slate">포인트 보유 학생</p>
          <p className="mt-3 text-3xl font-bold text-forest">
            {activeWithPoints.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">잔액 1 이상</p>
        </div>
        <div className="rounded-[28px] border border-ink/8 bg-white p-6 shadow-panel">
          <p className="text-xs font-medium uppercase tracking-wider text-slate">평균 잔액</p>
          <p className="mt-3 text-3xl font-bold text-ink">
            {avgBalance.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate">상위 50명 기준</p>
        </div>
      </div>

      {/* Exam Type Filter */}
      <div className="mt-10 flex items-center gap-2">
        <span className="text-sm font-medium text-slate">수험 유형:</span>
        <div className="flex gap-2">
          <Link
            href="/admin/points/leaderboard"
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              !examTypeFilter
                ? "border-forest/30 bg-forest/10 text-forest"
                : "border-ink/10 bg-white text-slate hover:bg-mist"
            }`}
          >
            전체
          </Link>
          {Object.values(ExamType).map((et) => (
            <Link
              key={et}
              href={`/admin/points/leaderboard?examType=${et}`}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                examTypeFilter === et
                  ? "border-forest/30 bg-forest/10 text-forest"
                  : "border-ink/10 bg-white text-slate hover:bg-mist"
              }`}
            >
              {EXAM_TYPE_LABEL[et]}
            </Link>
          ))}
        </div>
      </div>

      {/* Top 50 Leaderboard Table */}
      <div className="mt-6 rounded-[28px] border border-ink/8 bg-white shadow-panel overflow-hidden">
        <div className="px-6 py-5 border-b border-ink/8">
          <h2 className="text-base font-semibold text-ink">
            포인트 잔액 상위 50명
            {examTypeFilter && (
              <span className="ml-2 text-sm font-normal text-slate">
                ({EXAM_TYPE_LABEL[examTypeFilter]})
              </span>
            )}
          </h2>
        </div>

        {leaderboard.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate">
            포인트 보유 학생이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-ink/8 bg-mist/40">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    순위
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    학번
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    이름
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    연락처
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    유형
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    포인트 잔액
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {leaderboard.map((row) => (
                  <tr key={row.examNumber} className="hover:bg-mist/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <RankBadge rank={row.rank} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/admin/students/${row.examNumber}`}
                        className="font-mono text-xs text-slate hover:text-forest transition-colors"
                      >
                        {row.examNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        href={`/admin/students/${row.examNumber}`}
                        className="font-medium text-ink hover:text-forest transition-colors"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate">
                      {row.phone ?? "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          row.examType === ExamType.GONGCHAE
                            ? "border-sky-200 bg-sky-50 text-sky-700"
                            : "border-purple-200 bg-purple-50 text-purple-700"
                        }`}
                      >
                        {EXAM_TYPE_LABEL[row.examType]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <span className="font-bold text-ember">
                        {row.balance.toLocaleString()}P
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Point Activity */}
      <div className="mt-8 rounded-[28px] border border-ink/8 bg-white shadow-panel overflow-hidden">
        <div className="px-6 py-5 border-b border-ink/8 flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink">최근 포인트 내역 (20건)</h2>
          <Link
            href="/admin/points/history"
            className="text-xs font-medium text-forest hover:underline"
          >
            전체 보기 →
          </Link>
        </div>

        {recentLogRows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-slate">
            포인트 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-ink/8 bg-mist/40">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    일시
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    학번
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    이름
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    유형
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate">
                    사유
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate">
                    포인트
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {recentLogRows.map((log) => (
                  <tr key={log.id} className="hover:bg-mist/30 transition-colors">
                    <td className="px-6 py-3 whitespace-nowrap text-xs text-slate">
                      {new Date(log.grantedAt).toLocaleDateString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      <Link
                        href={`/admin/students/${log.examNumber}`}
                        className="font-mono text-xs text-slate hover:text-forest transition-colors"
                      >
                        {log.examNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      <Link
                        href={`/admin/students/${log.examNumber}`}
                        className="font-medium text-ink hover:text-forest transition-colors"
                      >
                        {log.studentName}
                      </Link>
                    </td>
                    <td className="px-6 py-3 whitespace-nowrap">
                      <span className="inline-flex rounded-full border border-ink/10 bg-mist px-2.5 py-0.5 text-xs font-medium text-slate">
                        {POINT_TYPE_LABEL[log.type]}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate max-w-[200px] truncate">{log.reason}</td>
                    <td className="px-6 py-3 whitespace-nowrap text-right">
                      <span
                        className={`font-bold ${log.amount >= 0 ? "text-forest" : "text-ember"}`}
                      >
                        {log.amount >= 0 ? "+" : ""}
                        {log.amount.toLocaleString()}P
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom nav links */}
      <div className="mt-8 flex gap-3 flex-wrap">
        <Link
          href="/admin/points/manage"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-mist"
        >
          포인트 직접 관리
        </Link>
        <Link
          href="/admin/points/history"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-mist"
        >
          포인트 전체 이력
        </Link>
        <Link
          href="/admin/points"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-mist"
        >
          포인트 현황 대시보드
        </Link>
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-white shadow-sm">
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-400 text-sm font-bold text-white shadow-sm">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-700 text-sm font-bold text-white shadow-sm">
        3
      </span>
    );
  }
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-ink/10 bg-mist text-sm font-semibold text-slate">
      {rank}
    </span>
  );
}
