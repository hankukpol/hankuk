import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/settings/staff — list all admin users with staff info
export async function GET(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const staffList = await getPrisma().adminUser.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        staff: {
          select: {
            id: true,
            role: true,
            mobile: true,
            note: true,
            lastLoginAt: true,
            isActive: true,
          },
        },
      },
      orderBy: [{ role: "desc" }, { name: "asc" }],
    });

    const data = staffList.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      phone: s.phone,
      role: s.role,
      isActive: s.isActive,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      staffRole: s.staff?.role ?? null,
      staffMobile: s.staff?.mobile ?? null,
      staffNote: s.staff?.note ?? null,
      lastLoginAt: s.staff?.lastLoginAt?.toISOString() ?? null,
    }));

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}
