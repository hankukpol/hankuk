import { AdminRole, ProspectStage } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseYearMonth(value: string | null): { year: number; month: number } | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [y, m] = value.split("-").map(Number);
  return { year: y, month: m - 1 }; // month is 0-indexed
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = request.nextUrl;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const staffIdParam = searchParams.get("staffId");

  const now = new Date();

  // Default: last 6 months
  const toMonthDefault = { year: now.getFullYear(), month: now.getMonth() };
  const fromMonthDefault = {
    year: now.getFullYear(),
    month: now.getMonth() - 5 < 0 ? 12 + (now.getMonth() - 5) : now.getMonth() - 5,
  };
  // Adjust year if needed
  if (toMonthDefault.month - 5 < 0) {
    fromMonthDefault.year = toMonthDefault.year - 1;
    fromMonthDefault.month = 12 + (toMonthDefault.month - 5);
  } else {
    fromMonthDefault.year = toMonthDefault.year;
    fromMonthDefault.month = toMonthDefault.month - 5;
  }

  const fromParsed = parseYearMonth(fromParam) ?? fromMonthDefault;
  const toParsed = parseYearMonth(toParam) ?? toMonthDefault;

  const rangeStart = new Date(fromParsed.year, fromParsed.month, 1, 0, 0, 0, 0);
  const rangeEnd = new Date(toParsed.year, toParsed.month + 1, 0, 23, 59, 59, 999);

  const fromKey = `${fromParsed.year}-${String(fromParsed.month + 1).padStart(2, "0")}`;
  const toKey = `${toParsed.year}-${String(toParsed.month + 1).padStart(2, "0")}`;

  const prisma = getPrisma();

  // Load all prospects in the range with staff info
  const prospects = await prisma.consultationProspect.findMany({
    where: {
      visitedAt: { gte: rangeStart, lte: rangeEnd },
      ...(staffIdParam ? { staffId: staffIdParam } : {}),
    },
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
  const visitRate = totalProspects > 0 ? Math.round((visitedCount / totalProspects) * 1000) / 10 : 0;
  const enrollmentRate = visitedCount > 0 ? Math.round((enrolledCount / visitedCount) * 1000) / 10 : 0;
  const overallConversionRate =
    totalProspects > 0 ? Math.round((enrolledCount / totalProspects) * 1000) / 10 : 0;

  // Per-staff breakdown
  type StaffAccum = {
    staffId: string;
    staffName: string;
    prospects: number;
    enrolled: number;
  };
  const staffMap = new Map<string, StaffAccum>();
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
      conversionRate: s.prospects > 0 ? Math.round((s.enrolled / s.prospects) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.conversionRate - a.conversionRate);

  // Monthly trend – iterate over all months in range
  const monthKeys: string[] = [];
  {
    let y = fromParsed.year;
    let m = fromParsed.month;
    while (y < toParsed.year || (y === toParsed.year && m <= toParsed.month)) {
      monthKeys.push(`${y}-${String(m + 1).padStart(2, "0")}`);
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
  }

  type MonthBucket = { month: string; newProspects: number; enrolled: number; conversionRate: number };
  const monthMap = new Map<string, { newProspects: number; enrolled: number }>();
  for (const key of monthKeys) {
    monthMap.set(key, { newProspects: 0, enrolled: 0 });
  }
  for (const p of prospects) {
    const d = p.visitedAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bucket = monthMap.get(key);
    if (!bucket) continue;
    bucket.newProspects += 1;
    if (p.stage === ProspectStage.REGISTERED) bucket.enrolled += 1;
  }
  const monthlyTrend: MonthBucket[] = monthKeys.map((key) => {
    const b = monthMap.get(key)!;
    return {
      month: key,
      newProspects: b.newProspects,
      enrolled: b.enrolled,
      conversionRate:
        b.newProspects > 0 ? Math.round((b.enrolled / b.newProspects) * 1000) / 10 : 0,
    };
  });

  return NextResponse.json({
    data: {
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
    },
  });
}
