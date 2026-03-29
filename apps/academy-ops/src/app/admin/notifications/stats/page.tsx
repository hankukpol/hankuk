import Link from "next/link";
import { AdminRole, NotificationChannel, NotificationType } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { NOTIFICATION_TYPE_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// ─── Cost per channel ─────────────────────────────────────────────────────────
const CHANNEL_COST: Record<NotificationChannel, number> = {
  ALIMTALK: 15,
  SMS: 20,
  WEB_PUSH: 0,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function korMonthLabel(year: number, month: number): string {
  return `${year}년 ${month}월`;
}

function shortMonthLabel(year: number, month: number): string {
  return `${month}월`;
}

function formatKRW(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function NotificationStatsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const prisma = getPrisma();
  const now = new Date();

  // ── Date boundaries ────────────────────────────────────────────────────────
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Previous month boundaries for comparison
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  // Last 6 months (from start of month-5 to now)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0);

  // Average daily sends (based on current month days so far)
  const daysElapsed = now.getDate();

  // ── Parallel data fetching ─────────────────────────────────────────────────
  const [
    currentMonthLogs,
    prevMonthCount,
    prevMonthFailed,
    typeGroupCurrent,
    channelGroupCurrent,
    sixMonthRawLogs,
    allTimeFailed,
    allTimeSent,
  ] = await Promise.all([
    // Full current month logs (for cost calculation + KPI)
    prisma.notificationLog.findMany({
      where: { sentAt: { gte: currentMonthStart, lte: currentMonthEnd } },
      select: { channel: true, status: true, type: true },
    }),
    // Previous month count
    prisma.notificationLog.count({
      where: { sentAt: { gte: prevMonthStart, lte: prevMonthEnd } },
    }),
    // Previous month failures
    prisma.notificationLog.count({
      where: { sentAt: { gte: prevMonthStart, lte: prevMonthEnd }, status: "failed" },
    }),
    // Current month breakdown by type
    prisma.notificationLog.groupBy({
      by: ["type"],
      where: { sentAt: { gte: currentMonthStart, lte: currentMonthEnd } },
      _count: { id: true },
    }),
    // Current month breakdown by channel
    prisma.notificationLog.groupBy({
      by: ["channel"],
      where: { sentAt: { gte: currentMonthStart, lte: currentMonthEnd } },
      _count: { id: true },
    }),
    // 6-month raw for monthly chart
    prisma.notificationLog.findMany({
      where: { sentAt: { gte: sixMonthsAgo } },
      select: { sentAt: true, status: true, channel: true },
      orderBy: { sentAt: "asc" },
    }),
    // All-time failed
    prisma.notificationLog.count({ where: { status: "failed" } }),
    // All-time sent
    prisma.notificationLog.count({ where: { status: "sent" } }),
  ]);

  // ── Current month KPIs ─────────────────────────────────────────────────────
  const currentMonthTotal = currentMonthLogs.length;
  const currentMonthFailed = currentMonthLogs.filter((l) => l.status === "failed").length;
  const currentMonthSent = currentMonthLogs.filter((l) => l.status === "sent").length;

  const currentMonthCost = currentMonthLogs.reduce((sum, log) => {
    return sum + (CHANNEL_COST[log.channel] ?? 0);
  }, 0);

  const successRate =
    currentMonthTotal > 0
      ? ((currentMonthSent / currentMonthTotal) * 100).toFixed(1)
      : "100.0";

  const avgDailyCount =
    daysElapsed > 0 ? (currentMonthTotal / daysElapsed).toFixed(1) : "0.0";

  const prevMonthSuccessRate =
    prevMonthCount > 0
      ? (((prevMonthCount - prevMonthFailed) / prevMonthCount) * 100).toFixed(1)
      : "100.0";

  // ── Type breakdown for current month ──────────────────────────────────────
  const typeRows = typeGroupCurrent
    .map((g) => ({
      type: g.type,
      label: NOTIFICATION_TYPE_LABEL[g.type] ?? g.type,
      count: g._count.id,
      pct: currentMonthTotal > 0 ? Math.round((g._count.id / currentMonthTotal) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // ── Channel breakdown ──────────────────────────────────────────────────────
  const channelRows = channelGroupCurrent.map((g) => ({
    channel: g.channel,
    count: g._count.id,
    cost: g._count.id * (CHANNEL_COST[g.channel] ?? 0),
  }));

  const channelLabel: Record<NotificationChannel, string> = {
    ALIMTALK: "카카오 알림톡",
    SMS: "SMS",
    WEB_PUSH: "Web Push",
  };

  // ── Monthly chart data ─────────────────────────────────────────────────────
  type MonthEntry = { year: number; month: number; total: number; sent: number; failed: number; cost: number };
  const monthMap = new Map<string, MonthEntry>();

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(key, { year: d.getFullYear(), month: d.getMonth() + 1, total: 0, sent: 0, failed: 0, cost: 0 });
  }

  for (const log of sixMonthRawLogs) {
    const d = log.sentAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const entry = monthMap.get(key);
    if (entry) {
      entry.total += 1;
      if (log.status === "sent") entry.sent += 1;
      else if (log.status === "failed") entry.failed += 1;
      entry.cost += CHANNEL_COST[log.channel] ?? 0;
    }
  }

  const monthlyData = Array.from(monthMap.values());
  const maxMonthTotal = Math.max(...monthlyData.map((m) => m.total), 1);

  // ── All-time cumulative ────────────────────────────────────────────────────
  const allTimeTotal = allTimeFailed + allTimeSent;
  const allTimeSuccessRate =
    allTimeTotal > 0 ? (((allTimeTotal - allTimeFailed) / allTimeTotal) * 100).toFixed(1) : "100.0";

  const korMonthNow = korMonthLabel(now.getFullYear(), now.getMonth() + 1);

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        알림 &rsaquo; 발송 통계
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">알림 발송 통계</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate">
            월별 알림 발송 현황, 채널별 비용 추정, 성공률을 한눈에 확인합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/notifications/history"
            className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
          >
            발송 이력 보기
          </Link>
          <Link
            href="/admin/notifications"
            className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
          >
            알림 발송 관리
          </Link>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate">
          {korMonthNow} 현황
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* 이달 발송 */}
          <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate">이달 발송</p>
            <p className="mt-3 text-3xl font-bold text-ink">
              {currentMonthTotal.toLocaleString("ko-KR")}
              <span className="ml-1 text-base font-normal text-slate">건</span>
            </p>
            <p className="mt-1.5 text-xs text-slate/70">
              {prevMonthCount > 0 && (
                <>
                  전월 대비{" "}
                  <span
                    className={
                      currentMonthTotal >= prevMonthCount ? "text-forest font-medium" : "text-red-600 font-medium"
                    }
                  >
                    {currentMonthTotal >= prevMonthCount ? "+" : ""}
                    {(currentMonthTotal - prevMonthCount).toLocaleString("ko-KR")}건
                  </span>
                </>
              )}
              {prevMonthCount === 0 && "발송 시작"}
            </p>
          </article>

          {/* 이달 예상 비용 */}
          <article className="rounded-[28px] border border-amber-200 bg-amber-50/60 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">이달 예상 비용</p>
            <p className="mt-3 text-3xl font-bold text-amber-700">
              {formatKRW(currentMonthCost)}
            </p>
            <p className="mt-1.5 text-xs text-amber-600/80">
              알림톡 ₩15 / SMS ₩20 기준
            </p>
          </article>

          {/* 발송 성공률 */}
          <article className="rounded-[28px] border border-forest/20 bg-forest/5 p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-forest">발송 성공률</p>
            <p className="mt-3 text-3xl font-bold text-forest">
              {successRate}
              <span className="ml-0.5 text-base font-normal">%</span>
            </p>
            <p className="mt-1.5 text-xs text-forest/70">
              성공 {currentMonthSent.toLocaleString("ko-KR")}건 / 실패 {currentMonthFailed.toLocaleString("ko-KR")}건
            </p>
          </article>

          {/* 평균 일별 발송 */}
          <article className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate">평균 일별 발송</p>
            <p className="mt-3 text-3xl font-bold text-ink">
              {avgDailyCount}
              <span className="ml-1 text-base font-normal text-slate">건/일</span>
            </p>
            <p className="mt-1.5 text-xs text-slate/70">
              {daysElapsed}일 경과 기준
            </p>
          </article>
        </div>
      </section>

      {/* ── Monthly trend table ─────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate">
          월별 발송 추이 (최근 6개월)
        </h2>

        {/* Bar chart (CSS-only) */}
        <div className="mb-6 rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
          <div className="flex h-36 items-end gap-3">
            {monthlyData.map((m) => {
              const barPct = maxMonthTotal > 0 ? Math.max((m.total / maxMonthTotal) * 100, m.total > 0 ? 4 : 0) : 0;
              const isCurrent = m.year === now.getFullYear() && m.month === now.getMonth() + 1;
              return (
                <div key={`${m.year}-${m.month}`} className="group flex flex-1 flex-col items-center gap-1">
                  <div className="relative flex w-full flex-col items-center justify-end" style={{ height: "104px" }}>
                    {m.total > 0 && (
                      <span className="mb-1 text-[10px] font-semibold text-ink/60">
                        {m.total}
                      </span>
                    )}
                    <div
                      className={[
                        "w-full rounded-t-lg transition-all",
                        isCurrent ? "bg-ember" : "bg-forest/40",
                      ].join(" ")}
                      style={{ height: `${barPct}%` }}
                    />
                  </div>
                  <span
                    className={[
                      "text-[11px] font-medium",
                      isCurrent ? "text-ember font-semibold" : "text-slate",
                    ].join(" ")}
                  >
                    {shortMonthLabel(m.year, m.month)}
                    {isCurrent && (
                      <span className="ml-0.5 text-[9px] align-super">이달</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate/60 text-right">
            주황: 이달 &nbsp;|&nbsp; 초록: 이전 월
          </p>
        </div>

        {/* Monthly summary table */}
        <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
          <div className="border-b border-ink/5 bg-mist/40 px-6 py-4">
            <h3 className="font-semibold text-ink">월별 상세</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-ink/5">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">월</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">발송수</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-forest">성공</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-red-600">실패</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate">성공률</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">예상비용</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {[...monthlyData].reverse().map((m) => {
                  const isCurrent = m.year === now.getFullYear() && m.month === now.getMonth() + 1;
                  const rate =
                    m.total > 0
                      ? ((m.sent / m.total) * 100).toFixed(1)
                      : "—";
                  return (
                    <tr
                      key={`${m.year}-${m.month}`}
                      className={[
                        "transition hover:bg-mist/40",
                        isCurrent ? "bg-ember/5" : "",
                      ].join(" ")}
                    >
                      <td className="px-6 py-3 font-medium text-ink">
                        {korMonthLabel(m.year, m.month)}
                        {isCurrent && (
                          <span className="ml-2 rounded-full bg-ember/10 px-2 py-0.5 text-[10px] font-semibold text-ember">
                            이달
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-ink">
                        {m.total.toLocaleString("ko-KR")}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-forest">
                        {m.sent.toLocaleString("ko-KR")}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-red-600">
                        {m.failed > 0 ? m.failed.toLocaleString("ko-KR") : <span className="text-slate/40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-slate">
                        {m.total > 0 ? `${rate}%` : <span className="text-slate/40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-amber-700">
                        {m.cost > 0 ? formatKRW(m.cost) : <span className="text-slate/40">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Type breakdown ──────────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate">
          유형별 발송 현황 ({korMonthNow})
        </h2>

        {typeRows.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
            이달 발송 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel">
            <div className="divide-y divide-ink/5">
              {typeRows.map((row) => (
                <div key={row.type} className="flex items-center gap-4 px-6 py-4">
                  <div className="min-w-[140px]">
                    <span className="font-medium text-ink">{row.label}</span>
                    <span className="ml-2 text-xs text-slate/60 font-mono">{row.type}</span>
                  </div>
                  {/* Bar */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink/5">
                        <div
                          className="h-full rounded-full bg-ember transition-all"
                          style={{ width: `${row.pct}%` }}
                        />
                      </div>
                      <span className="w-12 text-right text-xs font-semibold text-slate">
                        {row.pct}%
                      </span>
                    </div>
                  </div>
                  <div className="w-16 text-right text-sm font-bold text-ink">
                    {row.count.toLocaleString("ko-KR")}건
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── Channel breakdown ───────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate">
          채널별 현황 ({korMonthNow})
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {channelRows.length === 0 ? (
            <div className="col-span-3 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
              이달 발송 내역이 없습니다.
            </div>
          ) : (
            channelRows.map((row) => (
              <div
                key={row.channel}
                className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">{channelLabel[row.channel] ?? row.channel}</p>
                  <span className="rounded-full border border-ink/10 px-2 py-0.5 text-[10px] font-semibold text-slate">
                    건당 {CHANNEL_COST[row.channel] > 0 ? `₩${CHANNEL_COST[row.channel]}` : "무료"}
                  </span>
                </div>
                <p className="mt-3 text-2xl font-bold text-ink">
                  {row.count.toLocaleString("ko-KR")}
                  <span className="ml-1 text-sm font-normal text-slate">건</span>
                </p>
                {row.cost > 0 && (
                  <p className="mt-1 text-sm font-semibold text-amber-700">
                    {formatKRW(row.cost)}
                  </p>
                )}
                {row.cost === 0 && (
                  <p className="mt-1 text-sm text-slate/50">비용 없음</p>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* ── All-time summary ────────────────────────────────────────────────── */}
      <section className="mt-10">
        <div className="rounded-[28px] border border-ink/10 bg-mist/40 p-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate">누적 전체 현황</h2>
          <div className="flex flex-wrap gap-8">
            <div>
              <p className="text-xs text-slate">총 발송</p>
              <p className="mt-1 text-2xl font-bold text-ink">
                {allTimeTotal.toLocaleString("ko-KR")}
                <span className="ml-1 text-sm font-normal text-slate">건</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-slate">누적 실패</p>
              <p className={["mt-1 text-2xl font-bold", allTimeFailed > 0 ? "text-red-600" : "text-ink"].join(" ")}>
                {allTimeFailed.toLocaleString("ko-KR")}
                <span className="ml-1 text-sm font-normal text-slate">건</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-slate">전체 성공률</p>
              <p className="mt-1 text-2xl font-bold text-forest">
                {allTimeSuccessRate}
                <span className="ml-0.5 text-sm font-normal">%</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-slate">전월 성공률</p>
              <p className="mt-1 text-2xl font-bold text-ink">
                {prevMonthSuccessRate}
                <span className="ml-0.5 text-sm font-normal">%</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer nav ──────────────────────────────────────────────────────── */}
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/admin/notifications"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          &larr; 알림 발송 관리
        </Link>
        <Link
          href="/admin/notifications/history"
          className="inline-flex items-center gap-2 rounded-full border border-forest/20 bg-forest/5 px-5 py-2.5 text-sm font-medium text-forest transition hover:bg-forest/10"
        >
          발송 이력 조회
        </Link>
        <Link
          href="/admin/settings/notifications/auto-triggers"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          자동 트리거 설정
        </Link>
      </div>
    </div>
  );
}
