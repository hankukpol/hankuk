import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ─── Types ────────────────────────────────────────────────────────────────────

export type StaffMonthlyCell = {
  year: number;
  month: number;
  revenue: number;
  enrollCount: number;
};

export type StaffTrendRow = {
  staffId: string;
  staffName: string;
  staffRole: string;
  months: StaffMonthlyCell[]; // ordered from earliest to latest
  total: number;
};

export type SpecialLectureRevRow = {
  lectureId: string;
  lectureName: string;
  instructorName: string;
  instructorRate: number; // % (from subject)
  enrollCount: number;
  totalRevenue: number;
  instructorAmount: number;
};

export type AnalyticsResponse = {
  fromYearMonth: string; // YYYY-MM
  toYearMonth: string;   // YYYY-MM
  months: { year: number; month: number; label: string }[];
  staffTrend: StaffTrendRow[];
  specialLectures: SpecialLectureRevRow[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseYearMonth(raw: string | null): { year: number; month: number } | null {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split("-").map(Number);
  if (y < 2020 || y > 2100 || m < 1 || m > 12) return null;
  return { year: y, month: m };
}

function addMonths(year: number, month: number, delta: number) {
  const total = (year - 1) * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12) + 1, month: (total % 12) + 1 };
}

function monthLabel(year: number, month: number) {
  return `${year}년 ${month}월`;
}

function monthStart(year: number, month: number) {
  return new Date(year, month - 1, 1);
}

function monthEnd(year: number, month: number) {
  return new Date(year, month, 0, 23, 59, 59, 999);
}

// ─── GET /api/staff-settlements/analytics ────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const today = new Date();

  // Default: last 6 months (including current month)
  const defaultTo = { year: today.getFullYear(), month: today.getMonth() + 1 };
  const defaultFrom = addMonths(defaultTo.year, defaultTo.month, -5);

  const fromParam = parseYearMonth(sp.get("from")) ?? defaultFrom;
  const toParam = parseYearMonth(sp.get("to")) ?? defaultTo;

  // Build ordered month list
  const months: { year: number; month: number; label: string }[] = [];
  let cur = { ...fromParam };
  while (
    cur.year < toParam.year ||
    (cur.year === toParam.year && cur.month <= toParam.month)
  ) {
    months.push({ ...cur, label: monthLabel(cur.year, cur.month) });
    cur = addMonths(cur.year, cur.month, 1);
    // safety cap
    if (months.length >= 24) break;
  }

  const db = getPrisma();

  // ── Staff list ──────────────────────────────────────────────────────────────
  const staffList = await db.staff.findMany({
    where: { isActive: true, adminUserId: { not: null } },
    select: { id: true, name: true, role: true, adminUserId: true },
    orderBy: { name: "asc" },
  });

  const adminUserIds = staffList
    .map((s) => s.adminUserId)
    .filter((id): id is string => id !== null);

  // ── Aggregate payments for entire range in one query ───────────────────────
  // We'll group by (processedBy, month-bucket). Prisma doesn't support date trunc
  // groupBy, so we fetch raw aggregates per month per staff in parallel.
  const rangeStart = monthStart(fromParam.year, fromParam.month);
  const rangeEnd = monthEnd(toParam.year, toParam.month);

  // Fetch all payments in range for the relevant staff members
  const payments =
    adminUserIds.length > 0
      ? await db.payment.findMany({
          where: {
            processedBy: { in: adminUserIds },
            processedAt: { gte: rangeStart, lte: rangeEnd },
            status: { notIn: ["CANCELLED"] },
          },
          select: {
            processedBy: true,
            processedAt: true,
            netAmount: true,
          },
        })
      : [];

  // Also fetch enrollment counts per staff in range
  const enrollments =
    adminUserIds.length > 0
      ? await db.courseEnrollment.findMany({
          where: {
            staffId: { in: adminUserIds },
            createdAt: { gte: rangeStart, lte: rangeEnd },
          },
          select: {
            staffId: true,
            createdAt: true,
          },
        })
      : [];

  // Build nested map: staffAdminId -> monthKey -> { revenue, enrollCount }
  type MonthBucket = { revenue: number; enrollCount: number };
  const staffMap = new Map<string, Map<string, MonthBucket>>();

  for (const p of payments) {
    const d = new Date(p.processedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    let inner = staffMap.get(p.processedBy);
    if (!inner) {
      inner = new Map();
      staffMap.set(p.processedBy, inner);
    }
    const existing = inner.get(key);
    if (existing) {
      existing.revenue += p.netAmount;
    } else {
      inner.set(key, { revenue: p.netAmount, enrollCount: 0 });
    }
  }

  for (const e of enrollments) {
    const d = new Date(e.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    let inner = staffMap.get(e.staffId);
    if (!inner) {
      inner = new Map();
      staffMap.set(e.staffId, inner);
    }
    const existing = inner.get(key);
    if (existing) {
      existing.enrollCount++;
    } else {
      inner.set(key, { revenue: 0, enrollCount: 1 });
    }
  }

  // Build trend rows
  const staffTrend: StaffTrendRow[] = staffList.map((staff) => {
    const adminId = staff.adminUserId!;
    const inner = staffMap.get(adminId);
    const monthCells: StaffMonthlyCell[] = months.map((m) => {
      const key = `${m.year}-${String(m.month).padStart(2, "0")}`;
      const bucket = inner?.get(key);
      return { year: m.year, month: m.month, revenue: bucket?.revenue ?? 0, enrollCount: bucket?.enrollCount ?? 0 };
    });
    const total = monthCells.reduce((s, c) => s + c.revenue, 0);
    return {
      staffId: staff.id,
      staffName: staff.name,
      staffRole: staff.role as string,
      months: monthCells,
      total,
    };
  });

  // ── Special lecture revenue breakdown ───────────────────────────────────────
  // Enrollments belong to SpecialLecture (not SpecialLectureSubject).
  // For single-subject lectures we use the subject's instructor & rate.
  // For multi-subject lectures we show per-subject rows with the shared revenue.
  const specialLectures = await db.specialLecture.findMany({
    where: {
      isActive: true,
      subjects: { some: {} },
    },
    select: {
      id: true,
      name: true,
      isMultiSubject: true,
      enrollments: {
        where: {
          createdAt: { gte: rangeStart, lte: rangeEnd },
          status: { notIn: ["CANCELLED", "WITHDRAWN"] },
        },
        select: { finalFee: true },
      },
      subjects: {
        select: {
          instructorRate: true,
          instructor: { select: { name: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  const specialLectureRows: SpecialLectureRevRow[] = [];

  for (const lec of specialLectures) {
    const enrollCount = lec.enrollments.length;
    const totalRevenue = lec.enrollments.reduce(
      (s: number, e: { finalFee: number }) => s + e.finalFee,
      0
    );

    if (lec.subjects.length === 0) continue;

    if (lec.isMultiSubject && lec.subjects.length > 1) {
      // Multi-subject: one row per subject, split revenue equally (best estimate)
      const perSubjectRevenue = Math.floor(totalRevenue / lec.subjects.length);
      for (const subj of lec.subjects) {
        const instructorAmount = Math.floor(
          perSubjectRevenue * (subj.instructorRate / 100)
        );
        specialLectureRows.push({
          lectureId: lec.id,
          lectureName: lec.name,
          instructorName: subj.instructor.name,
          instructorRate: subj.instructorRate,
          enrollCount,
          totalRevenue: perSubjectRevenue,
          instructorAmount,
        });
      }
    } else {
      // Single subject: one row for the lecture
      const subj = lec.subjects[0];
      const instructorAmount = Math.floor(
        totalRevenue * (subj.instructorRate / 100)
      );
      specialLectureRows.push({
        lectureId: lec.id,
        lectureName: lec.name,
        instructorName: subj.instructor.name,
        instructorRate: subj.instructorRate,
        enrollCount,
        totalRevenue,
        instructorAmount,
      });
    }
  }

  // Sort by totalRevenue desc
  specialLectureRows.sort((a, b) => b.totalRevenue - a.totalRevenue);

  const response: AnalyticsResponse = {
    fromYearMonth: `${fromParam.year}-${String(fromParam.month).padStart(2, "0")}`,
    toYearMonth: `${toParam.year}-${String(toParam.month).padStart(2, "0")}`,
    months,
    staffTrend,
    specialLectures: specialLectureRows,
  };

  return NextResponse.json({ data: response });
}
