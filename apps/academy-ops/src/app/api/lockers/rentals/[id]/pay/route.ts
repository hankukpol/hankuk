import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await context.params;

    const existing = await getPrisma().lockerRental.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "대여 내역을 찾을 수 없습니다." }, { status: 404 });
    }

    const rental = await getPrisma().lockerRental.update({
      where: { id },
      data: {
        paidAt: new Date(),
      },
    });

    return NextResponse.json({ rental });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "납부 처리 실패" },
      { status: 400 },
    );
  }
}
