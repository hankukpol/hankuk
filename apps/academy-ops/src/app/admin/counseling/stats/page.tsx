import Link from "next/link";
import { AdminRole, ProspectSource, ProspectStage } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { StatsClient } from "./stats-client";
import type { StageCounts, MonthlyTrendEntry, StaffStat, SourceEntry } from "./stats-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

const SOURCE_LABELS: Record<ProspectSource, string> = {
  WALK_IN: "내방",
  PHONE: "전화",
  SNS: "SNS·온라인",
  REFERRAL: "추천",
  OTHER: "기타",
};

function readStringParam(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const val = searchParams?.[key];
  return typeof val === "string" ? val : undefined;
}

function buildMonthUrl(base: string, yearNum: number, monthNum: number) {
  const m = `${yearNum}-${String(monthNum).padStart(2, "0")}`;
  return `${base}?month=${m}`;
}

export default async function CounselingStatsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const monthParam = readStringParam(searchParams, "month");

  let year: number;
  let month: number; // 0-indexed

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    year = y;
    month = m - 1;
  } else {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth();
  }

  const currentMonthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

  // Prev / next month navigation
  const prevDate = new Date(year, month - 1, 1);
  const nextDate = new Date(year, month + 1, 1);
  const prevMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
  const nextMonthKey = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const isCurrentMonth = currentMonthKey === todayKey;

  // ── DB queries ───────────────────────────────────────────────────────────────

  // Selected-month prospects
  const prospects = await getPrisma().consultationProspect.findMany({
    where: { visitedAt: { gte: monthStart, lte: monthEnd } },
    include: { staff: { select: { id: true, name: true } } },
  });

  // Stage counts
  const stageCounts: StageCounts = {
    INQUIRY: 0,
    VISITING: 0,
    DECIDING: 0,
    REGISTERED: 0,
    DROPPED: 0,
  };
  for (const p of prospects) {
    stageCounts[p.stage] += 1;
  }

  const totalProspects = prospects.length;
  const registeredCount = stageCounts.REGISTERED;
  const droppedCount = stageCounts.DROPPED;
  const resolvedCount = registeredCount + droppedCount;
  const conversionRate =
    resolvedCount > 0 ? Math.round((registeredCount / resolvedCount) * 1000) / 10 : 0;

  // Monthly trend: last 6 months
  const sixMonthsAgo = new Date(year, month - 5, 1, 0, 0, 0, 0);
  const allRecentProspects = await getPrisma().consultationProspect.findMany({
    where: { visitedAt: { gte: sixMonthsAgo, lte: monthEnd } },
    select: { visitedAt: true, stage: true },
  });

  const trendMap = new Map<
    string,
    MonthlyTrendEntry
  >();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, month - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    trendMap.set(key, {
      month: key,
      inquiry: 0,
      visiting: 0,
      deciding: 0,
      registered: 0,
      dropped: 0,
    });
  }
  for (const p of allRecentProspects) {
    const d = p.visitedAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const entry = trendMap.get(key);
    if (!entry) continue;
    if (p.stage === ProspectStage.INQUIRY) entry.inquiry += 1;
    else if (p.stage === ProspectStage.VISITING) entry.visiting += 1;
    else if (p.stage === ProspectStage.DECIDING) entry.deciding += 1;
    else if (p.stage === ProspectStage.REGISTERED) entry.registered += 1;
    else if (p.stage === ProspectStage.DROPPED) entry.dropped += 1;
  }
  const monthlyTrend = Array.from(trendMap.values());

  // Per-staff stats
  type StaffAccum = { staffId: string; staffName: string; total: number; registered: number; dropped: number };
  const staffMap = new Map<string, StaffAccum>();
  for (const p of prospects) {
    const key = p.staffId;
    const name = p.staff?.name ?? "미배정";
    if (!staffMap.has(key)) {
      staffMap.set(key, { staffId: key, staffName: name, total: 0, registered: 0, dropped: 0 });
    }
    const entry = staffMap.get(key)!;
    entry.total += 1;
    if (p.stage === ProspectStage.REGISTERED) entry.registered += 1;
    if (p.stage === ProspectStage.DROPPED) entry.dropped += 1;
  }
  const staffStats: StaffStat[] = Array.from(staffMap.values())
    .map((s) => {
      const resolved = s.registered + s.dropped;
      return {
        staffName: s.staffName,
        total: s.total,
        registered: s.registered,
        dropped: s.dropped,
        conversionRate: resolved > 0 ? Math.round((s.registered / resolved) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => b.total - a.total);

  // Source breakdown
  const sourceMap = new Map<ProspectSource, number>();
  for (const p of prospects) {
    sourceMap.set(p.source, (sourceMap.get(p.source) ?? 0) + 1);
  }
  const sourceBreakdown: SourceEntry[] = Array.from(sourceMap.entries())
    .map(([source, count]) => ({ source, label: SOURCE_LABELS[source], count }))
    .sort((a, b) => b.count - a.count);

  // ── Render ───────────────────────────────────────────────────────────────────

  const monthLabel = `${year}년 ${month + 1}월`;

  const statsData = {
    period: {
      start: monthStart.toISOString(),
      end: monthEnd.toISOString(),
      month: currentMonthKey,
    },
    totalProspects,
    stageCounts,
    conversionRate,
    monthlyTrend,
    staffStats,
    sourceBreakdown,
  };

  return (
    <div className="space-y-8 p-8 sm:p-10">
      {/* Header */}
      <div>
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          상담 관리
        </div>
        <h1 className="mt-5 text-3xl font-semibold">상담 전환율 통계</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
          문의·내방 예비 원생이 단계별로 어떻게 이동했는지, 직원별·유입경로별 전환 성과를 분석합니다.
        </p>
        <div className="mt-4">
          <Link
            prefetch={false}
            href="/admin/counseling/prospects"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate transition hover:text-ember"
          >
            <span>←</span>
            <span>상담 방문자 관리로</span>
          </Link>
        </div>
      </div>

      {/* Month filter */}
      <div className="flex items-center gap-3">
        <Link
          prefetch={false}
          href={`/admin/counseling/stats?month=${prevMonthKey}`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ink/10 bg-white text-slate transition hover:border-ink/20 hover:text-ink"
        >
          ‹
        </Link>
        <div className="min-w-[120px] text-center text-base font-semibold text-ink">{monthLabel}</div>
        <Link
          prefetch={false}
          href={isCurrentMonth ? "#" : `/admin/counseling/stats?month=${nextMonthKey}`}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
            isCurrentMonth
              ? "cursor-default border-ink/5 bg-mist text-ink/30"
              : "border-ink/10 bg-white text-slate hover:border-ink/20 hover:text-ink"
          }`}
          aria-disabled={isCurrentMonth}
        >
          ›
        </Link>
        {!isCurrentMonth && (
          <Link
            prefetch={false}
            href="/admin/counseling/stats"
            className="ml-2 inline-flex items-center rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs font-medium text-slate transition hover:border-ember/30 hover:text-ember"
          >
            이번 달
          </Link>
        )}
      </div>

      {/* Summary KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">총 상담 건수</p>
          <p className="mt-3 text-3xl font-semibold">
            {totalProspects}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className="mt-2 text-xs text-slate">{monthLabel} 전체 상담</p>
        </article>

        <article className="rounded-[28px] border border-forest/20 bg-forest/5 p-6">
          <p className="text-sm text-slate">전환율</p>
          <p className="mt-3 text-3xl font-semibold text-forest">
            {resolvedCount > 0 ? `${conversionRate}%` : "-"}
          </p>
          <p className="mt-2 text-xs text-slate">
            등록 완료 ÷ (등록 + 미등록) · 결정 건수 기준
          </p>
        </article>

        <article className="rounded-[28px] border border-ink/10 bg-white p-6">
          <p className="text-sm text-slate">등록 완료</p>
          <p className="mt-3 text-3xl font-semibold text-forest">
            {registeredCount}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className="mt-2 text-xs text-slate">최종 수강 등록으로 전환</p>
        </article>

        <article className="rounded-[28px] border border-red-100 bg-red-50/40 p-6">
          <p className="text-sm text-slate">미등록</p>
          <p className="mt-3 text-3xl font-semibold text-red-600">
            {droppedCount}
            <span className="ml-1 text-base font-normal text-slate">건</span>
          </p>
          <p className="mt-2 text-xs text-slate">이탈 처리된 상담 건수</p>
        </article>
      </div>

      {/* Charts + tables (client component) */}
      <StatsClient data={statsData} />
    </div>
  );
}
