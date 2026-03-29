import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function parseYearMonth(
  yearParam: string | null,
  monthParam: string | null
): { year: number; month: number } {
  const today = new Date();
  const year = yearParam ? parseInt(yearParam, 10) : today.getFullYear();
  const month = monthParam ? parseInt(monthParam, 10) : today.getMonth() + 1;
  return {
    year: isNaN(year) ? today.getFullYear() : year,
    month: isNaN(month)
      ? today.getMonth() + 1
      : Math.max(1, Math.min(12, month)),
  };
}

export type StaffDetailPaymentItem = {
  id: string;
  processedAt: string;
  category: string;
  method: string;
  netAmount: number;
  studentName: string | null;
  itemSummary: string;
};

export type StaffDetailMonthRow = {
  yearMonth: string; // "YYYY-MM"
  paymentCount: number;
  totalRevenue: number;
};

export type StaffDetailResponse = {
  staffId: string;
  staffName: string;
  staffRole: string;
  adminUserId: string;
  year: number;
  month: number;
  paymentCount: number;
  totalRevenue: number;
  payments: StaffDetailPaymentItem[];
  history: StaffDetailMonthRow[]; // past 6 months including current
};

export async function GET(
  request: NextRequest,
  { params }: { params: { staffId: string } }
) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { staffId } = params;
  const sp = request.nextUrl.searchParams;
  const { year, month } = parseYearMonth(sp.get("year"), sp.get("month"));

  const db = getPrisma();

  // Look up staff record
  const staff = await db.staff.findUnique({
    where: { id: staffId },
    select: { id: true, name: true, role: true, adminUserId: true },
  });

  if (!staff) {
    return NextResponse.json({ error: "직원을 찾을 수 없습니다." }, { status: 404 });
  }

  if (!staff.adminUserId) {
    return NextResponse.json({ error: "이 직원은 관리자 계정과 연동되어 있지 않습니다." }, { status: 400 });
  }

  const adminUserId = staff.adminUserId;

  // Selected month date range
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0, 23, 59, 59, 999);

  // Fetch payments for selected month, with student and items
  const payments = await db.payment.findMany({
    where: {
      processedBy: adminUserId,
      processedAt: { gte: firstDay, lte: lastDay },
      status: { notIn: ["CANCELLED"] },
    },
    select: {
      id: true,
      processedAt: true,
      category: true,
      method: true,
      netAmount: true,
      student: { select: { name: true } },
      items: { select: { itemName: true, amount: true }, orderBy: { amount: "desc" } },
    },
    orderBy: { processedAt: "desc" },
  });

  const paymentItems: StaffDetailPaymentItem[] = payments.map((p) => {
    const itemSummary =
      p.items.length > 0
        ? p.items.map((i) => i.itemName).join(", ")
        : "-";
    return {
      id: p.id,
      processedAt: p.processedAt.toISOString(),
      category: p.category,
      method: p.method,
      netAmount: p.netAmount,
      studentName: p.student?.name ?? null,
      itemSummary,
    };
  });

  // Past 6 months history (including current month)
  const historyMonths: StaffDetailMonthRow[] = [];
  for (let i = 5; i >= 0; i--) {
    // Walk back from current month
    const d = new Date(year, month - 1 - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const hFirst = new Date(y, m - 1, 1);
    const hLast = new Date(y, m, 0, 23, 59, 59, 999);

    const agg = await db.payment.aggregate({
      where: {
        processedBy: adminUserId,
        processedAt: { gte: hFirst, lte: hLast },
        status: { notIn: ["CANCELLED"] },
      },
      _count: { id: true },
      _sum: { netAmount: true },
    });

    historyMonths.push({
      yearMonth: `${y}-${String(m).padStart(2, "0")}`,
      paymentCount: agg._count.id,
      totalRevenue: agg._sum.netAmount ?? 0,
    });
  }

  const response: StaffDetailResponse = {
    staffId: staff.id,
    staffName: staff.name,
    staffRole: staff.role,
    adminUserId,
    year,
    month,
    paymentCount: payments.length,
    totalRevenue: payments.reduce((s, p) => s + p.netAmount, 0),
    payments: paymentItems,
    history: historyMonths,
  };

  return NextResponse.json({ data: response });
}
