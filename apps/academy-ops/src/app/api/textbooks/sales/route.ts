import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = request.nextUrl;
  const dateStr = searchParams.get("date"); // YYYY-MM-DD (특정일 필터)
  const monthStr = searchParams.get("month"); // YYYY-MM (월 필터)
  const dateFromStr = searchParams.get("dateFrom"); // YYYY-MM-DD (범위 시작)
  const dateToStr = searchParams.get("dateTo"); // YYYY-MM-DD (범위 종료)
  const textbookIdStr = searchParams.get("textbookId"); // 교재별 필터
  const aggregate = searchParams.get("aggregate"); // "monthly" | "textbook"
  const limitStr = searchParams.get("limit") ?? "200";

  const limit = Math.min(Number(limitStr) || 200, 1000);

  let dateFilter: { soldAt?: { gte: Date; lte: Date } } = {};

  if (dateFromStr && dateToStr) {
    const start = new Date(dateFromStr + "T00:00:00");
    const end = new Date(dateToStr + "T23:59:59");
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      dateFilter = { soldAt: { gte: start, lte: end } };
    }
  } else if (dateStr) {
    const d = new Date(dateStr);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
    dateFilter = { soldAt: { gte: start, lte: end } };
  } else if (monthStr) {
    const [y, m] = monthStr.split("-").map(Number);
    if (!isNaN(y) && !isNaN(m)) {
      const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
      const end = new Date(y, m, 0, 23, 59, 59, 999);
      dateFilter = { soldAt: { gte: start, lte: end } };
    }
  }

  const textbookFilter =
    textbookIdStr && !isNaN(Number(textbookIdStr))
      ? { textbookId: Number(textbookIdStr) }
      : {};

  const whereClause = { ...dateFilter, ...textbookFilter };

  // 집계 요청: 월별 집계
  if (aggregate === "monthly") {
    const rows = await getPrisma().textbookSale.findMany({
      where: whereClause,
      select: {
        soldAt: true,
        quantity: true,
        totalPrice: true,
      },
      orderBy: { soldAt: "asc" },
      take: limit,
    });

    // 월 단위로 그룹핑 (YYYY-MM)
    const monthly = new Map<string, { count: number; quantity: number; totalPrice: number }>();
    for (const row of rows) {
      const key = `${row.soldAt.getFullYear()}-${String(row.soldAt.getMonth() + 1).padStart(2, "0")}`;
      const existing = monthly.get(key) ?? { count: 0, quantity: 0, totalPrice: 0 };
      monthly.set(key, {
        count: existing.count + 1,
        quantity: existing.quantity + row.quantity,
        totalPrice: existing.totalPrice + row.totalPrice,
      });
    }

    return NextResponse.json({
      aggregate: "monthly",
      data: Array.from(monthly.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, stats]) => ({ month, ...stats })),
    });
  }

  // 집계 요청: 교재별 집계
  if (aggregate === "textbook") {
    const grouped = await getPrisma().textbookSale.groupBy({
      by: ["textbookId"],
      where: whereClause,
      _count: { id: true },
      _sum: { quantity: true, totalPrice: true },
      orderBy: { _sum: { totalPrice: "desc" } },
    });

    const textbookIds = grouped.map((g) => g.textbookId);
    const textbooks = await getPrisma().textbook.findMany({
      where: { id: { in: textbookIds } },
      select: { id: true, title: true, subject: true, price: true, stock: true },
    });
    const tbMap = new Map(textbooks.map((t) => [t.id, t]));

    return NextResponse.json({
      aggregate: "textbook",
      data: grouped.map((g) => ({
        textbookId: g.textbookId,
        textbook: tbMap.get(g.textbookId) ?? null,
        saleCount: g._count.id,
        totalQuantity: g._sum.quantity ?? 0,
        totalAmount: g._sum.totalPrice ?? 0,
      })),
    });
  }

  // 기본: 판매 이력 목록
  const sales = await getPrisma().textbookSale.findMany({
    where: whereClause,
    include: {
      textbook: { select: { id: true, title: true, subject: true } },
      staff: { select: { name: true } },
    },
    orderBy: { soldAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ sales });
}
