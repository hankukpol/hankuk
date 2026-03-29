import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type MonthlyHistoryRow = {
  year: number;
  month: number;
  monthLabel: string; // e.g. "2026년 3월"
  totalRevenue: number;
  paymentCount: number;
};

export type StaffSettlementHistoryResponse = {
  staffId: string;
  staffName: string;
  year: number;
  months: MonthlyHistoryRow[];
  yearTotal: number;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { staffId } = await params;
  const sp = request.nextUrl.searchParams;

  const today = new Date();
  const yearParam = sp.get("year");
  const year = yearParam && /^\d{4}$/.test(yearParam)
    ? parseInt(yearParam, 10)
    : today.getFullYear();

  const db = getPrisma();

  // Look up staff record
  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: { id: true, name: true, adminUserId: true },
  });

  if (!staff) {
    return NextResponse.json({ error: "직원을 찾을 수 없습니다." }, { status: 404 });
  }

  if (!staff.adminUserId) {
    return NextResponse.json(
      { error: "이 직원은 관리자 계정과 연동되어 있지 않습니다." },
      { status: 400 }
    );
  }

  const adminUserId = staff.adminUserId;

  // Build monthly data for all 12 months of the selected year
  const months: MonthlyHistoryRow[] = [];

  for (let m = 1; m <= 12; m++) {
    const firstDay = new Date(year, m - 1, 1);
    const lastDay = new Date(year, m, 0, 23, 59, 59, 999);

    // Don't query future months
    const isCurrentOrPast =
      year < today.getFullYear() ||
      (year === today.getFullYear() && m <= today.getMonth() + 1);

    if (!isCurrentOrPast) {
      months.push({
        year,
        month: m,
        monthLabel: `${year}년 ${m}월`,
        totalRevenue: 0,
        paymentCount: 0,
      });
      continue;
    }

    const agg = await db.payment.aggregate({
      where: {
        processedBy: adminUserId,
        processedAt: { gte: firstDay, lte: lastDay },
        status: { notIn: ["CANCELLED"] },
      },
      _count: { id: true },
      _sum: { netAmount: true },
    });

    months.push({
      year,
      month: m,
      monthLabel: `${year}년 ${m}월`,
      totalRevenue: agg._sum.netAmount ?? 0,
      paymentCount: agg._count.id,
    });
  }

  const yearTotal = months.reduce((s, r) => s + r.totalRevenue, 0);

  const response: StaffSettlementHistoryResponse = {
    staffId: staff.id,
    staffName: staff.name,
    year,
    months,
    yearTotal,
  };

  return NextResponse.json({ data: response });
}
