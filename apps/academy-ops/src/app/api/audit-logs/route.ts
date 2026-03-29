import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.DEPUTY_DIRECTOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sp = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(sp.get("limit") ?? "50", 10)));
  const adminId = sp.get("adminId")?.trim() || undefined;
  const action = sp.get("action")?.trim() || undefined;
  const startDate = sp.get("startDate")?.trim() || undefined;
  const endDate = sp.get("endDate")?.trim() || undefined;
  const targetType = sp.get("targetType")?.trim() || undefined;

  // Build date range filter
  let createdAtFilter: { gte?: Date; lte?: Date } | undefined;
  if (startDate || endDate) {
    createdAtFilter = {};
    if (startDate) {
      const d = new Date(startDate + "T00:00:00");
      if (!isNaN(d.getTime())) createdAtFilter.gte = d;
    }
    if (endDate) {
      const d = new Date(endDate + "T23:59:59");
      if (!isNaN(d.getTime())) createdAtFilter.lte = d;
    }
  }

  const where = {
    ...(adminId ? { adminId } : {}),
    ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
    ...(targetType ? { targetType: { contains: targetType, mode: "insensitive" as const } } : {}),
    ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
  };

  const prisma = getPrisma();

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: {
        admin: {
          select: { name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return NextResponse.json({
    data: {
      logs,
      total,
      page,
      totalPages,
    },
  });
}

