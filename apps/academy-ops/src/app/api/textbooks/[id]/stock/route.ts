import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const id = context.params.id;
    const textbookId = Number(id);
    if (!Number.isInteger(textbookId) || textbookId <= 0) throw new Error("잘못된 교재 ID");

    const body = await request.json();
    const { quantity, reason } = body;

    const adjustNum = Number(quantity);
    if (isNaN(adjustNum) || adjustNum === 0) {
      throw new Error("조정 수량은 0이 아닌 정수여야 합니다.");
    }

    const textbook = await getPrisma().$transaction(async (tx) => {
      const existing = await tx.textbook.findUniqueOrThrow({ where: { id: textbookId } });

      const newStock = Math.max(0, existing.stock + adjustNum);

      const updated = await tx.textbook.update({
        where: { id: textbookId },
        data: { stock: newStock },
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "ADJUST_TEXTBOOK_STOCK",
          targetType: "textbook",
          targetId: String(textbookId),
          before: { stock: existing.stock },
          after: {
            stock: updated.stock,
            adjustment: adjustNum,
            reason: reason ?? null,
          },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return updated;
    });

    return NextResponse.json({ textbook });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "재고 조정 실패" },
      { status: 400 },
    );
  }
}
