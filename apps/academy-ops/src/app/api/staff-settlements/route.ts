import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseYearMonth(yearParam: string | null, monthParam: string | null): { year: number; month: number } {
  const today = new Date();
  const year = yearParam ? parseInt(yearParam, 10) : today.getFullYear();
  const month = monthParam ? parseInt(monthParam, 10) : today.getMonth() + 1;
  return {
    year: isNaN(year) ? today.getFullYear() : year,
    month: isNaN(month) ? today.getMonth() + 1 : Math.max(1, Math.min(12, month)),
  };
}

export type StaffSettlementItem = {
  staffId: string;       // AdminUser.id (UUID)
  staffName: string;
  staffRole: string;
  adminUserId: string;
  paymentCount: number;
  totalRevenue: number;
  commissionRate: number;  // percentage, 0 = not set (UI handles input)
  commissionAmount: number;
};

export type StaffSettlementsResponse = {
  year: number;
  month: number;
  settlements: StaffSettlementItem[];
  grandTotal: {
    paymentCount: number;
    totalRevenue: number;
    commissionAmount: number;
  };
};

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const { year, month } = parseYearMonth(sp.get("year"), sp.get("month"));

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0, 23, 59, 59, 999);

  // Get all active staff with their linked AdminUser
  const staffList = await getPrisma().staff.findMany({
    where: { isActive: true, adminUserId: { not: null } },
    select: {
      id: true,
      name: true,
      role: true,
      adminUserId: true,
    },
    orderBy: { name: "asc" },
  });

  // For each admin user linked to staff, aggregate their processed payments for this month
  const adminUserIds = staffList
    .map((s) => s.adminUserId)
    .filter((id): id is string => id !== null);

  // Aggregate payments grouped by processedBy (AdminUser.id)
  const paymentAggregates = await getPrisma().payment.groupBy({
    by: ["processedBy"],
    where: {
      processedBy: { in: adminUserIds },
      processedAt: { gte: firstDay, lte: lastDay },
      status: { notIn: ["CANCELLED"] },
    },
    _count: { id: true },
    _sum: { netAmount: true },
  });

  // Build lookup map: adminUserId => aggregate
  const aggregateMap = new Map(
    paymentAggregates.map((agg) => [
      agg.processedBy,
      {
        count: agg._count.id,
        total: agg._sum.netAmount ?? 0,
      },
    ])
  );

  // Build settlement rows
  const settlements: StaffSettlementItem[] = staffList.map((staff) => {
    const adminId = staff.adminUserId ?? "";
    const agg = aggregateMap.get(adminId);
    const paymentCount = agg?.count ?? 0;
    const totalRevenue = agg?.total ?? 0;

    return {
      staffId: staff.id,
      staffName: staff.name,
      staffRole: staff.role,
      adminUserId: adminId,
      paymentCount,
      totalRevenue,
      commissionRate: 0, // UI manages per-row commission rate
      commissionAmount: 0,
    };
  });

  const grandTotal = {
    paymentCount: settlements.reduce((s, r) => s + r.paymentCount, 0),
    totalRevenue: settlements.reduce((s, r) => s + r.totalRevenue, 0),
    commissionAmount: 0, // Computed on client after user enters rates
  };

  return NextResponse.json({
    data: {
      year,
      month,
      settlements,
      grandTotal,
    } satisfies StaffSettlementsResponse,
  });
}
