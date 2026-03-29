import { AdminRole, RefundType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { refundType, amount, reason, bankName, accountNo, accountHolder } = body;

    if (!refundType) throw new Error("환불 유형을 선택하세요.");
    if (!amount || Number(amount) <= 0) throw new Error("환불금액을 입력하세요.");
    if (!reason?.trim()) throw new Error("환불 사유를 입력하세요.");

    const allowedTypes: RefundType[] = ["CASH", "TRANSFER", "PARTIAL"];
    if (!allowedTypes.includes(refundType as RefundType)) {
      throw new Error("지원하지 않는 환불 유형입니다.");
    }

    const result = await getPrisma().$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: params.id },
        include: {
          refunds: {
            where: { status: { in: ["PENDING", "APPROVED", "COMPLETED"] } },
            select: { amount: true },
          },
        },
      });

      if (!payment) throw new Error("결제 내역을 찾을 수 없습니다.");
      if (payment.status === "FULLY_REFUNDED" || payment.status === "CANCELLED") {
        throw new Error("이미 전액 환불되었거나 취소된 결제입니다.");
      }
      if (payment.status === "PENDING") {
        throw new Error("승인되지 않은 결제는 환불할 수 없습니다.");
      }

      const totalRefunded = payment.refunds.reduce((sum, r) => sum + r.amount, 0);
      const remaining = payment.netAmount - totalRefunded;
      const refundAmount = Number(amount);

      if (refundAmount > remaining) {
        throw new Error(`환불 가능 금액(${remaining.toLocaleString()}원)을 초과했습니다.`);
      }

      const refund = await tx.refund.create({
        data: {
          paymentId: params.id,
          refundType: refundType as RefundType,
          status: "PENDING",
          amount: refundAmount,
          reason: reason.trim(),
          bankName: bankName?.trim() || null,
          accountNo: accountNo?.trim() || null,
          accountHolder: accountHolder?.trim() || null,
          processedBy: auth.context.adminUser.id,
          processedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "CREATE_REFUND",
          targetType: "payment",
          targetId: params.id,
          after: {
            refundId: refund.id,
            refundType,
            amount: refundAmount,
            reason: reason.trim(),
            status: "PENDING",
          },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return { refund, payment };
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "환불 처리 실패" },
      { status: 400 },
    );
  }
}
