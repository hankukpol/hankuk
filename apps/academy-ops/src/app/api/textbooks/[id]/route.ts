import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RouteContext = { params: { id: string } };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const id = Number(context.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("잘못된 교재 ID");

    const body = await request.json();
    const { title, author, publisher, price, stock, subject, isActive, stockAdjust } = body;

    const textbook = await getPrisma().$transaction(async (tx) => {
      const existing = await tx.textbook.findUniqueOrThrow({ where: { id } });

      let newStock: number | undefined;
      if (stockAdjust !== undefined) {
        newStock = Math.max(0, existing.stock + Number(stockAdjust));
      } else if (stock !== undefined) {
        if (Number(stock) < 0) throw new Error("재고는 0개 이상이어야 합니다.");
        newStock = Number(stock);
      }

      if (price !== undefined && Number(price) < 0)
        throw new Error("가격은 0원 이상이어야 합니다.");

      const updated = await tx.textbook.update({
        where: { id },
        data: {
          ...(title !== undefined ? { title: title.trim() } : {}),
          ...(author !== undefined ? { author: author?.trim() || null } : {}),
          ...(publisher !== undefined ? { publisher: publisher?.trim() || null } : {}),
          ...(price !== undefined ? { price: Number(price) } : {}),
          ...(newStock !== undefined ? { stock: newStock } : {}),
          ...(subject !== undefined ? { subject: subject || null } : {}),
          ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: stockAdjust !== undefined ? "ADJUST_TEXTBOOK_STOCK" : "UPDATE_TEXTBOOK",
          targetType: "textbook",
          targetId: String(id),
          before: { title: existing.title, price: existing.price, stock: existing.stock },
          after: { title: updated.title, price: updated.price, stock: updated.stock },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return updated;
    });

    return NextResponse.json({ textbook });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const id = Number(context.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("잘못된 교재 ID");

    await getPrisma().$transaction(async (tx) => {
      const existing = await tx.textbook.findUniqueOrThrow({ where: { id } });
      await tx.textbook.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "DELETE_TEXTBOOK",
          targetType: "textbook",
          targetId: String(id),
          before: { title: existing.title, price: existing.price, stock: existing.stock },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제 실패" },
      { status: 400 },
    );
  }
}
