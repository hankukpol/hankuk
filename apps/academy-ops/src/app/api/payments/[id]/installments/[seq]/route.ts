import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; seq: string } },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const paymentId = params.id;
  const seq = Number(params.seq);

  if (!Number.isInteger(seq) || seq < 1) {
    return NextResponse.json({ error: "잘못된 회차 번호입니다." }, { status: 400 });
  }

  try {
    const installment = await getPrisma().installment.findUnique({
      where: { paymentId_seq: { paymentId, seq } },
      include: { payment: { select: { examNumber: true, netAmount: true } } },
    });

    if (!installment) {
      return NextResponse.json(
        { error: "분할납부 항목을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (installment.paidAt !== null) {
      return NextResponse.json(
        { error: "이미 납부 처리된 항목입니다." },
        { status: 409 },
      );
    }

    const now = new Date();

    const updated = await getPrisma().$transaction(async (tx) => {
      const result = await tx.installment.update({
        where: { paymentId_seq: { paymentId, seq } },
        data: { paidAt: now },
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "PAY_INSTALLMENT",
          targetType: "installment",
          targetId: result.id,
          after: {
            paymentId,
            seq,
            amount: result.amount,
            paidAt: now.toISOString(),
            examNumber: installment.payment.examNumber,
          },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return result;
    });

    return NextResponse.json({ data: { paidAt: updated.paidAt } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "납부 처리 실패" },
      { status: 400 },
    );
  }
}
