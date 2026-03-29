import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const id = Number(context.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("잘못된 교재 ID");

    const sales = await getPrisma().textbookSale.findMany({
      where: { textbookId: id },
      include: {
        staff: { select: { name: true } },
      },
      orderBy: { soldAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ sales });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 400 },
    );
  }
}
