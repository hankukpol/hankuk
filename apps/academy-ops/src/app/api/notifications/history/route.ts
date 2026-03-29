import { AdminRole, NotificationType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const size = Math.min(100, Math.max(1, parseInt(searchParams.get("size") ?? "20", 10)));
  const typeParam = searchParams.get("type");
  const statusParam = searchParams.get("status");
  const dateParam = searchParams.get("date"); // "yyyy-MM" format
  const includeMonthly = searchParams.get("includeMonthly") === "true";

  const typeFilter =
    typeParam && Object.values(NotificationType).includes(typeParam as NotificationType)
      ? (typeParam as NotificationType)
      : undefined;

  const statusFilter = statusParam && statusParam !== "ALL" ? statusParam : undefined;

  let sentAtFilter: { gte?: Date; lte?: Date } | undefined;
  if (dateParam && /^\d{4}-\d{2}$/.test(dateParam)) {
    const [year, month] = dateParam.split("-").map(Number);
    sentAtFilter = {
      gte: new Date(year, month - 1, 1, 0, 0, 0),
      lte: new Date(year, month, 0, 23, 59, 59),
    };
  }

  const where = {
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(sentAtFilter ? { sentAt: sentAtFilter } : {}),
  };

  const prisma = getPrisma();

  // Current month for KPI stats
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Monthly chart: last 6 months
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0);

  const queries: Promise<unknown>[] = [
    prisma.notificationLog.count({ where }),
    prisma.notificationLog.findMany({
      where,
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: { sentAt: "desc" },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.notificationLog.count({
      where: { sentAt: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.notificationLog.count({
      where: {
        sentAt: { gte: monthStart, lte: monthEnd },
        status: "failed",
      },
    }),
  ];

  if (includeMonthly) {
    // Aggregate monthly counts (last 6 months, success vs fail)
    queries.push(
      prisma.notificationLog.findMany({
        where: {
          sentAt: { gte: sixMonthsAgo },
        },
        select: {
          sentAt: true,
          status: true,
        },
        orderBy: { sentAt: "asc" },
      }),
    );
  }

  const results = await Promise.all(queries);

  const total = results[0] as number;
  const notifications = results[1] as Awaited<ReturnType<typeof prisma.notificationLog.findMany>>;
  const monthTotal = results[2] as number;
  const monthFail = results[3] as number;

  const monthSuccess = monthTotal - monthFail;
  const successRate =
    monthTotal > 0 ? Math.round((monthSuccess / monthTotal) * 100) : 100;

  // Build monthly chart data if requested
  let monthlyChart: Array<{ month: string; sent: number; failed: number }> | undefined;

  if (includeMonthly && results[4]) {
    const rawLogs = results[4] as Array<{ sentAt: Date; status: string }>;

    // Build a map of "YYYY-MM" -> { sent, failed }
    const map = new Map<string, { sent: number; failed: number }>();

    // Pre-populate last 6 months with zeros
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, { sent: 0, failed: 0 });
    }

    for (const log of rawLogs) {
      const d = log.sentAt;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (map.has(key)) {
        const entry = map.get(key)!;
        if (log.status === "sent") {
          entry.sent += 1;
        } else if (log.status === "failed") {
          entry.failed += 1;
        }
      }
    }

    monthlyChart = Array.from(map.entries()).map(([month, counts]) => ({
      month,
      ...counts,
    }));
  }

  return NextResponse.json({
    data: {
      notifications,
      total,
      stats: {
        monthTotal,
        monthFail,
        successRate,
      },
      ...(monthlyChart ? { monthlyChart } : {}),
    },
  });
}
