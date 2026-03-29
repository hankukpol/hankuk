import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RouteContext = { params: { id: string } };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.ACADEMIC_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const id = Number(context.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("잘못된 교재 ID");

    const body = await request.json();
    const { quantity, examNumber, note } = body;

    const qty = Number(quantity);
    if (!qty || qty < 1) throw new Error("수량은 1개 이상이어야 합니다.");

    const result = await getPrisma().$transaction(async (tx) => {
      const textbook = await tx.textbook.findUniqueOrThrow({ where: { id } });

      if (!textbook.isActive) throw new Error("판매 중단된 교재입니다.");
      if (textbook.stock < qty) throw new Error(`재고 부족 (현재 재고: ${textbook.stock}개)`);

      const unitPrice = textbook.price;
      const totalPrice = unitPrice * qty;

      // Decrement stock
      const updated = await tx.textbook.update({
        where: { id },
        data: { stock: { decrement: qty } },
      });

      // Create sale record
      const sale = await tx.textbookSale.create({
        data: {
          textbookId: id,
          examNumber: examNumber?.trim() || null,
          staffId: auth.context.adminUser.id,
          quantity: qty,
          unitPrice,
          totalPrice,
          note: note?.trim() || null,
        },
        include: {
          textbook: { select: { title: true } },
          staff: { select: { name: true } },
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "SELL_TEXTBOOK",
          targetType: "textbook",
          targetId: String(id),
          before: { stock: textbook.stock },
          after: { stock: updated.stock, soldQty: qty, totalPrice },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return { sale, remainingStock: updated.stock };
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "판매 등록 실패" },
      { status: 400 },
    );
  }
}
