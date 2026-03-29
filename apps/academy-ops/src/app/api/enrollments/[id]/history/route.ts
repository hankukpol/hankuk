import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

// GET /api/enrollments/[id]/history — 수강 변경 이력 조회
export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await context.params;
    if (!id) throw new Error("잘못된 수강 ID");

    const histories = await getPrisma().enrollmentHistory.findMany({
      where: { enrollmentId: id },
      include: { admin: { select: { name: true } } },
      orderBy: { changedAt: "desc" },
    });

    return NextResponse.json({
      data: histories.map((h) => ({
        id: h.id,
        changeType: h.changeType,
        prevValue: h.prevValue,
        newValue: h.newValue,
        reason: h.reason,
        changedAt: h.changedAt.toISOString(),
        adminName: h.admin.name,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 400 },
    );
  }
}
