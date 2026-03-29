import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/settings/audit-logs
// Query params: ?adminId=&action=&targetType=&from=&to=&page=&limit=
export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.DEPUTY_DIRECTOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = request.nextUrl;

  const adminId = searchParams.get("adminId")?.trim() ?? "";
  const action = searchParams.get("action")?.trim() ?? "";
  const targetType = searchParams.get("targetType")?.trim() ?? "";
  const from = searchParams.get("from")?.trim() ?? "";
  const to = searchParams.get("to")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));

  let createdAtFilter: { gte?: Date; lte?: Date } | undefined;
  if (from || to) {
    createdAtFilter = {};
    if (from) {
      const d = new Date(from + "T00:00:00");
      if (!isNaN(d.getTime())) createdAtFilter.gte = d;
    }
    if (to) {
      const d = new Date(to + "T23:59:59");
      if (!isNaN(d.getTime())) createdAtFilter.lte = d;
    }
  }

  const where = {
    ...(adminId ? { adminId } : {}),
    ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
    ...(targetType
      ? { targetType: { contains: targetType, mode: "insensitive" as const } }
      : {}),
    ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
  };

  const prisma = getPrisma();

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: {
        admin: { select: { name: true, email: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({
    data: logs,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
}

