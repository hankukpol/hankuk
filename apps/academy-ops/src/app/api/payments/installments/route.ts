import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  // status: "all" | "overdue" | "upcoming" | "paid"
  const status = sp.get("status") ?? "all";
  const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);
  const limit = 50;
  const skip = (page - 1) * limit;

  // Optional date-range filters (ISO date string, e.g. "2026-03-24")
  const dueBefore = sp.get("dueBefore"); // dueDate < this date
  const dueAfter = sp.get("dueAfter");   // dueDate >= this date

  // today at 00:00:00 local time (server), converted to UTC
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  type WhereClause = {
    paidAt?: null | { not: null };
    dueDate?: { lt?: Date; gte?: Date; lte?: Date };
  };

  // Build where based on status tab
  let where: WhereClause = (() => {
    if (status === "overdue") {
      return { paidAt: null, dueDate: { lt: todayStart } };
    }
    if (status === "upcoming") {
      return { paidAt: null, dueDate: { gte: todayStart } };
    }
    if (status === "paid") {
      return { paidAt: { not: null } };
    }
    // "all"
    return {};
  })();

  // Apply optional dueBefore / dueAfter overrides
  if (dueBefore || dueAfter) {
    const dueDateFilter: { lt?: Date; gte?: Date } = {};
    if (dueBefore) {
      const d = new Date(dueBefore + "T00:00:00");
      if (!isNaN(d.getTime())) dueDateFilter.lt = d;
    }
    if (dueAfter) {
      const d = new Date(dueAfter + "T00:00:00");
      if (!isNaN(d.getTime())) dueDateFilter.gte = d;
    }
    if (Object.keys(dueDateFilter).length > 0) {
      where = { ...where, dueDate: dueDateFilter };
    }
  }

  const [items, total] = await getPrisma().$transaction([
    getPrisma().installment.findMany({
      where,
      include: {
        payment: {
          select: {
            id: true,
            enrollmentId: true,
            examNumber: true,
            category: true,
            netAmount: true,
            note: true,
            student: { select: { name: true, phone: true } },
            items: { select: { itemName: true }, take: 1 },
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { seq: "asc" }],
      skip,
      take: limit,
    }),
    getPrisma().installment.count({ where }),
  ]);

  // Summary counts (always computed fresh regardless of filter)
  const [overdueCount, upcomingCount, paidCount, totalUnpaidAmount] = await Promise.all([
    getPrisma().installment.count({
      where: { paidAt: null, dueDate: { lt: todayStart } },
    }),
    getPrisma().installment.count({
      where: { paidAt: null, dueDate: { gte: todayStart } },
    }),
    getPrisma().installment.count({
      where: { paidAt: { not: null } },
    }),
    getPrisma().installment.aggregate({
      where: { paidAt: null },
      _sum: { amount: true },
    }),
  ]);

  return NextResponse.json({
    data: {
      items,
      total,
      summary: {
        overdueCount,
        upcomingCount,
        paidCount,
        totalUnpaidAmount: totalUnpaidAmount._sum.amount ?? 0,
      },
    },
  });
}
