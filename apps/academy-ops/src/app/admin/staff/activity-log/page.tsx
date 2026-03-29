import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ROLE_LABEL } from "@/lib/constants";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

export const dynamic = "force-dynamic";

type PeriodKey = "today" | "7d" | "30d";

type PageProps = {
  searchParams?: {
    period?: string;
  };
};

function getPeriodFilter(period: PeriodKey): Date {
  const now = new Date();
  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  // 30d
  const d = new Date(now);
  d.setDate(d.getDate() - 30);
  return d;
}

function getPeriodLabel(period: PeriodKey): string {
  if (period === "today") return "오늘";
  if (period === "7d") return "최근 7일";
  return "최근 30일";
}

function getActionCategory(action: string): string {
  if (action.includes("PAYMENT") || action.includes("REFUND")) return "수납";
  if (action.includes("SCORE")) return "성적";
  if (action.includes("ENROLLMENT")) return "수강";
  if (action.includes("STUDENT")) return "학생";
  if (action.includes("NOTIFICATION") || action.includes("NOTICE")) return "알림";
  if (action.includes("COUNSELING") || action.includes("APPOINTMENT")) return "상담";
  if (action.includes("ABSENCE")) return "출결";
  if (action.includes("STAFF") || action.includes("ADMIN")) return "직원";
  return "기타";
}

function flagUnusual(
  totalActions: number,
  avgActions: number,
  period: PeriodKey,
): boolean {
  if (totalActions === 0) return false;
  // Flag if 3x above average and at least 50 actions
  return avgActions > 0 && totalActions > avgActions * 3 && totalActions >= 50;
}

export default async function StaffActivityLogPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.DIRECTOR);

  const rawPeriod = searchParams?.period ?? "7d";
  const period: PeriodKey =
    rawPeriod === "today" || rawPeriod === "7d" || rawPeriod === "30d"
      ? rawPeriod
      : "7d";

  const since = getPeriodFilter(period);
  const prisma = getPrisma();

  // ── KPI data ──────────────────────────────────────────────────────────────
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [allAdmins, totalActionsCount, todayActiveAdmins, auditByAdmin] =
    await Promise.all([
      prisma.adminUser.findMany({
        where: { isActive: true },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: "asc" },
      }),
      prisma.auditLog.count({
        where: { createdAt: { gte: since } },
      }),
      prisma.auditLog.groupBy({
        by: ["adminId"],
        where: { createdAt: { gte: todayStart } },
        _count: { id: true },
      }),
      prisma.auditLog.groupBy({
        by: ["adminId", "action"],
        where: { createdAt: { gte: since } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
      }),
    ]);

  const totalStaff = allAdmins.length;
  const todayActiveCount = todayActiveAdmins.length;
  const avgActionsPerStaff =
    totalStaff > 0 ? Math.round(totalActionsCount / totalStaff) : 0;

  // Group audit entries by admin
  type AdminStat = {
    adminId: string;
    totalActions: number;
    paymentActions: number;
    scoreActions: number;
    lastAction: Date | null;
    topAction: string | null;
    categories: Record<string, number>;
  };

  const statMap = new Map<string, AdminStat>();

  for (const adminUser of allAdmins) {
    statMap.set(adminUser.id, {
      adminId: adminUser.id,
      totalActions: 0,
      paymentActions: 0,
      scoreActions: 0,
      lastAction: null,
      topAction: null,
      categories: {},
    });
  }

  for (const row of auditByAdmin) {
    const stat = statMap.get(row.adminId);
    if (!stat) continue;
    const count = row._count.id;
    stat.totalActions += count;
    const cat = getActionCategory(row.action);
    stat.categories[cat] = (stat.categories[cat] ?? 0) + count;
    if (row.action.includes("PAYMENT") || row.action.includes("REFUND")) {
      stat.paymentActions += count;
    }
    if (row.action.includes("SCORE")) {
      stat.scoreActions += count;
    }
  }

  // Get last action time per admin in the period
  const lastActionRows = await prisma.auditLog.findMany({
    where: {
      adminId: { in: allAdmins.map((a) => a.id) },
      createdAt: { gte: since },
    },
    select: { adminId: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    distinct: ["adminId"],
  });

  for (const row of lastActionRows) {
    const stat = statMap.get(row.adminId);
    if (stat) {
      stat.lastAction = row.createdAt;
    }
  }

  // Compute top action per admin
  const topActionMap = new Map<string, { action: string; count: number }>();
  for (const row of auditByAdmin) {
    const existing = topActionMap.get(row.adminId);
    if (!existing || row._count.id > existing.count) {
      topActionMap.set(row.adminId, { action: row.action, count: row._count.id });
    }
  }
  for (const [adminId, top] of topActionMap) {
    const stat = statMap.get(adminId);
    if (stat) stat.topAction = top.action;
  }

  // Sort by total actions desc
  const sortedStats = allAdmins
    .map((adminUser) => ({
      adminUser,
      stat: statMap.get(adminUser.id)!,
    }))
    .sort((a, b) => (b.stat?.totalActions ?? 0) - (a.stat?.totalActions ?? 0));

  function periodUrl(p: PeriodKey) {
    return `/admin/staff/activity-log?period=${p}`;
  }

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        직원 · DIRECTOR+
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">직원 활동 로그</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        직원별 작업 통계를 기간별로 조회합니다. 비정상적인 활동을 감지하고 감사에
        활용하세요.
      </p>

      {/* Period filter */}
      <div className="mt-8 flex flex-wrap gap-3">
        {(["today", "7d", "30d"] as PeriodKey[]).map((p) => (
          <a
            key={p}
            href={periodUrl(p)}
            className={`inline-flex rounded-full border px-5 py-2.5 text-sm font-medium transition ${
              period === p
                ? "border-forest bg-forest text-white"
                : "border-ink/20 bg-white text-slate hover:border-ink/40 hover:text-ink"
            }`}
          >
            {getPeriodLabel(p)}
          </a>
        ))}
        <span className="ml-auto self-center text-sm text-slate">
          기준: {format(since, "yyyy-MM-dd(E) HH:mm", { locale: ko })} 이후
        </span>
      </div>

      {/* KPI cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">총 직원</p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {totalStaff.toLocaleString("ko-KR")}
          </p>
          <p className="mt-1 text-xs text-slate">활성 계정</p>
        </div>
        <div className="rounded-[28px] border border-sky-200 bg-sky-50 p-6">
          <p className="text-sm text-sky-700">오늘 활동 직원</p>
          <p className="mt-2 text-3xl font-bold text-sky-700">
            {todayActiveCount.toLocaleString("ko-KR")}
          </p>
          <p className="mt-1 text-xs text-sky-600">오늘 1건 이상 작업</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">총 액션 ({getPeriodLabel(period)})</p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {totalActionsCount.toLocaleString("ko-KR")}
          </p>
          <p className="mt-1 text-xs text-slate">감사 로그 기준</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">평균 액션/직원</p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {avgActionsPerStaff.toLocaleString("ko-KR")}
          </p>
          <p className="mt-1 text-xs text-slate">{getPeriodLabel(period)} 기준</p>
        </div>
      </div>

      {/* Activity table */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-white">
        {sortedStats.length === 0 ? (
          <div className="p-16 text-center text-sm text-slate">
            활성 직원이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist text-left">
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">
                    직원
                  </th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">
                    역할
                  </th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">
                    마지막 활동
                  </th>
                  <th className="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate">
                    총 액션
                  </th>
                  <th className="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate">
                    수납 처리
                  </th>
                  <th className="whitespace-nowrap px-5 py-4 text-right font-semibold text-slate">
                    성적 입력
                  </th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">
                    주요 작업
                  </th>
                  <th className="whitespace-nowrap px-5 py-4 font-semibold text-slate">
                    상태
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedStats.map(({ adminUser, stat }, idx) => {
                  const isUnusual = flagUnusual(
                    stat.totalActions,
                    avgActionsPerStaff,
                    period,
                  );
                  const isInactive = stat.totalActions === 0;

                  return (
                    <tr
                      key={adminUser.id}
                      className={`border-b border-ink/5 transition hover:bg-mist/60 ${
                        idx % 2 !== 0 ? "bg-gray-50/40" : ""
                      }`}
                    >
                      {/* Name */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <a
                          href={`/admin/settings/staff/${adminUser.id}`}
                          className="font-medium text-ink hover:text-forest hover:underline"
                        >
                          {adminUser.name}
                        </a>
                        <p className="text-xs text-slate">{adminUser.email}</p>
                      </td>

                      {/* Role */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-1 text-xs font-medium text-forest">
                          {ROLE_LABEL[adminUser.role]}
                        </span>
                      </td>

                      {/* Last active */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        {stat.lastAction ? (
                          <>
                            <p className="font-medium text-ink">
                              {format(stat.lastAction, "MM-dd(E)", {
                                locale: ko,
                              })}
                            </p>
                            <p className="text-xs text-slate">
                              {format(stat.lastAction, "HH:mm")}
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-slate/50">—</span>
                        )}
                      </td>

                      {/* Total actions */}
                      <td className="whitespace-nowrap px-5 py-3.5 text-right align-top">
                        <span
                          className={`text-lg font-bold ${
                            isInactive
                              ? "text-slate/40"
                              : isUnusual
                                ? "text-amber-700"
                                : "text-ink"
                          }`}
                        >
                          {stat.totalActions.toLocaleString("ko-KR")}
                        </span>
                      </td>

                      {/* Payment actions */}
                      <td className="whitespace-nowrap px-5 py-3.5 text-right align-top">
                        <span className="text-ink">
                          {stat.paymentActions.toLocaleString("ko-KR")}
                        </span>
                      </td>

                      {/* Score actions */}
                      <td className="whitespace-nowrap px-5 py-3.5 text-right align-top">
                        <span className="text-ink">
                          {stat.scoreActions.toLocaleString("ko-KR")}
                        </span>
                      </td>

                      {/* Top action */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        {stat.topAction ? (
                          <span className="inline-flex rounded-full border border-ink/10 bg-ink/5 px-2.5 py-1 text-xs font-mono text-slate">
                            {stat.topAction}
                          </span>
                        ) : (
                          <span className="text-xs text-slate/40">—</span>
                        )}
                      </td>

                      {/* Status badge */}
                      <td className="whitespace-nowrap px-5 py-3.5 align-top">
                        {isUnusual ? (
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                            비정상 활동
                          </span>
                        ) : isInactive ? (
                          <span className="inline-flex rounded-full border border-ink/10 bg-ink/5 px-2.5 py-1 text-xs font-semibold text-slate/60">
                            비활동
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-1 text-xs font-semibold text-forest">
                            정상
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Category breakdown */}
      {sortedStats.some((s) => s.stat.totalActions > 0) && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-ink">카테고리별 작업 분포</h2>
          <p className="mt-2 text-sm text-slate">
            {getPeriodLabel(period)} 동안 직원별 작업 유형 분포
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedStats
              .filter((s) => s.stat.totalActions > 0)
              .slice(0, 8)
              .map(({ adminUser, stat }) => (
                <div
                  key={adminUser.id}
                  className="rounded-[24px] border border-ink/10 bg-white p-5"
                >
                  <p className="font-semibold text-ink">{adminUser.name}</p>
                  <p className="mt-1 text-xs text-slate">
                    {ROLE_LABEL[adminUser.role]}
                  </p>
                  <div className="mt-3 space-y-2">
                    {Object.entries(stat.categories)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 5)
                      .map(([cat, count]) => (
                        <div
                          key={cat}
                          className="flex items-center justify-between"
                        >
                          <span className="text-xs text-slate">{cat}</span>
                          <span className="text-xs font-semibold text-ink">
                            {count.toLocaleString("ko-KR")}건
                          </span>
                        </div>
                      ))}
                  </div>
                  <p className="mt-3 border-t border-ink/10 pt-3 text-xs font-semibold text-ink">
                    합계: {stat.totalActions.toLocaleString("ko-KR")}건
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Link to full audit log */}
      <div className="mt-8 rounded-[28px] border border-ink/10 bg-mist p-6">
        <p className="text-sm text-slate">
          더 상세한 로그 조회가 필요하신가요?
        </p>
        <a
          href="/admin/settings/audit-logs"
          className="mt-3 inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-forest"
        >
          전체 감사 로그 보기
        </a>
      </div>
    </div>
  );
}
