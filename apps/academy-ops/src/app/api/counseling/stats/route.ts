import { AdminRole, ProspectSource, ProspectStage } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<ProspectSource, string> = {
  WALK_IN: "내방",
  PHONE: "전화",
  SNS: "SNS·온라인",
  REFERRAL: "추천",
  OTHER: "기타",
};

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = request.nextUrl;
  const monthParam = searchParams.get("month"); // YYYY-MM

  // Parse month or default to current month
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

  const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

  // Fetch prospects for selected month (with staff)
  const prospects = await getPrisma().consultationProspect.findMany({
    where: { visitedAt: { gte: monthStart, lte: monthEnd } },
    include: { staff: { select: { id: true, name: true } } },
  });

  // Stage counts for selected month
  const stageCounts: Record<ProspectStage, number> = {
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
  const conversionRate = resolvedCount > 0 ? (registeredCount / resolvedCount) * 100 : 0;

  // Monthly trend: last 6 months including current
  const sixMonthsAgo = new Date(year, month - 5, 1, 0, 0, 0, 0);
  const allRecentProspects = await getPrisma().consultationProspect.findMany({
    where: { visitedAt: { gte: sixMonthsAgo, lte: monthEnd } },
    select: { visitedAt: true, stage: true },
  });

  // Build monthly trend map
  const trendMap = new Map<
    string,
    { month: string; inquiry: number; visiting: number; deciding: number; registered: number; dropped: number }
  >();

  // Pre-populate all 6 months
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, month - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    trendMap.set(key, { month: key, inquiry: 0, visiting: 0, deciding: 0, registered: 0, dropped: 0 });
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
  type StaffStat = {
    staffId: string;
    staffName: string;
    total: number;
    registered: number;
    dropped: number;
  };
  const staffMap = new Map<string, StaffStat>();

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

  const staffStats = Array.from(staffMap.values())
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

  const sourceBreakdown = Array.from(sourceMap.entries())
    .map(([source, count]) => ({ source, label: SOURCE_LABELS[source], count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    data: {
      period: {
        start: monthStart.toISOString(),
        end: monthEnd.toISOString(),
        month: `${year}-${String(month + 1).padStart(2, "0")}`,
      },
      totalProspects,
      stageCounts,
      conversionRate: Math.round(conversionRate * 10) / 10,
      monthlyTrend,
      staffStats,
      sourceBreakdown,
    },
  });
}
