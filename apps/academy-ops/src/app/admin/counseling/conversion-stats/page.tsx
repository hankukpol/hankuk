import Link from "next/link";
import { AdminRole, ProspectStage } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ConversionDashboard } from "./conversion-dashboard";
import type { ConversionStats } from "./conversion-dashboard";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readStringParam(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | undefined {
  const val = searchParams?.[key];
  return typeof val === "string" ? val : undefined;
}

function parseYearMonth(value: string | undefined): { year: number; month: number } | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [y, m] = value.split("-").map(Number);
  return { year: y, month: m - 1 }; // month is 0-indexed
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export default async function ConversionStatsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.COUNSELOR);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  // Default range: last 6 months (ending this month)
  const defaultTo = { year: currentYear, month: currentMonth };
  const defaultFromDate = new Date(currentYear, currentMonth - 5, 1);
  const defaultFrom = { year: defaultFromDate.getFullYear(), month: defaultFromDate.getMonth() };

  const fromRaw = readStringParam(searchParams, "from");
  const toRaw = readStringParam(searchParams, "to");

  const fromParsed = parseYearMonth(fromRaw) ?? defaultFrom;
  const toParsed = parseYearMonth(toRaw) ?? defaultTo;

  const fromKey = monthKey(fromParsed.year, fromParsed.month);
  const toKey = monthKey(toParsed.year, toParsed.month);

  const rangeStart = new Date(fromParsed.year, fromParsed.month, 1, 0, 0, 0, 0);
  const rangeEnd = new Date(toParsed.year, toParsed.month + 1, 0, 23, 59, 59, 999);

  const prisma = getPrisma();

  // Load all prospects in range with staff info
  const prospects = await prisma.consultationProspect.findMany({
    where: { visitedAt: { gte: rangeStart, lte: rangeEnd } },
    include: { staff: { select: { id: true, name: true } } },
  });

  const totalProspects = prospects.length;

  // Funnel counts
  const visitedCount = prospects.filter(
    (p) =>
      p.stage === ProspectStage.VISITING ||
      p.stage === ProspectStage.DECIDING ||
      p.stage === ProspectStage.REGISTERED ||
      p.stage === ProspectStage.DROPPED,
  ).length;
  const decidingCount = prospects.filter((p) => p.stage === ProspectStage.DECIDING).length;
  const enrolledCount = prospects.filter((p) => p.stage === ProspectStage.REGISTERED).length;
  const droppedCount = prospects.filter((p) => p.stage === ProspectStage.DROPPED).length;

  // Rates
  const visitRate =
    totalProspects > 0 ? Math.round((visitedCount / totalProspects) * 1000) / 10 : 0;
  const enrollmentRate =
    visitedCount > 0 ? Math.round((enrolledCount / visitedCount) * 1000) / 10 : 0;
  const overallConversionRate =
    totalProspects > 0 ? Math.round((enrolledCount / totalProspects) * 1000) / 10 : 0;

  // Per-staff breakdown
  const staffMap = new Map<
    string,
    { staffId: string; staffName: string; prospects: number; enrolled: number }
  >();
  for (const p of prospects) {
    const key = p.staffId;
    const name = p.staff?.name ?? "미배정";
    if (!staffMap.has(key)) {
      staffMap.set(key, { staffId: key, staffName: name, prospects: 0, enrolled: 0 });
    }
    const entry = staffMap.get(key)!;
    entry.prospects += 1;
    if (p.stage === ProspectStage.REGISTERED) entry.enrolled += 1;
  }
  const staffBreakdown = Array.from(staffMap.values())
    .map((s) => ({
      staffId: s.staffId,
      staffName: s.staffName,
      prospects: s.prospects,
      enrolled: s.enrolled,
      conversionRate:
        s.prospects > 0 ? Math.round((s.enrolled / s.prospects) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.conversionRate - a.conversionRate);

  // Monthly trend
  const monthKeys: string[] = [];
  {
    let y = fromParsed.year;
    let m = fromParsed.month;
    while (y < toParsed.year || (y === toParsed.year && m <= toParsed.month)) {
      monthKeys.push(monthKey(y, m));
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
  }

  const monthBucketMap = new Map<string, { newProspects: number; enrolled: number }>();
  for (const k of monthKeys) {
    monthBucketMap.set(k, { newProspects: 0, enrolled: 0 });
  }
  for (const p of prospects) {
    const d = p.visitedAt;
    const k = monthKey(d.getFullYear(), d.getMonth());
    const bucket = monthBucketMap.get(k);
    if (!bucket) continue;
    bucket.newProspects += 1;
    if (p.stage === ProspectStage.REGISTERED) bucket.enrolled += 1;
  }
  const monthlyTrend = monthKeys.map((k) => {
    const b = monthBucketMap.get(k)!;
    return {
      month: k,
      newProspects: b.newProspects,
      enrolled: b.enrolled,
      conversionRate:
        b.newProspects > 0 ? Math.round((b.enrolled / b.newProspects) * 1000) / 10 : 0,
    };
  });

  const stats: ConversionStats = {
    period: { from: fromKey, to: toKey },
    totalProspects,
    visitedCount,
    decidingCount,
    enrolledCount,
    droppedCount,
    visitRate,
    enrollmentRate,
    overallConversionRate,
    staffBreakdown,
    monthlyTrend,
  };

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-slate">
        <Link href="/admin/counseling" className="transition hover:text-ember">
          면담 지원
        </Link>
        <span>/</span>
        <span className="text-ink">상담 전환율 분석</span>
      </nav>

      {/* Header */}
      <div className="mt-5">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          상담 관리
        </div>
        <h1 className="mt-5 text-3xl font-semibold">상담 전환율 분석</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
          예비 원생이 문의 → 방문 → 등록으로 이어지는 전환 깔때기와 담당자별 성과를 분석합니다.
        </p>
      </div>

      <div className="mt-8">
        <ConversionDashboard stats={stats} from={fromKey} to={toKey} />
      </div>
    </div>
  );
}
