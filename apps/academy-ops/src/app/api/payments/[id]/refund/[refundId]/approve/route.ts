import { AdminRole, PaymentStatus, RefundStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { sendEventNotification } from "@/lib/notifications/event-notify";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; refundId: string } },
) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { action, rejectionReason } = body as {
      action: "APPROVE" | "REJECT";
      rejectionReason?: string;
    };

    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json({ error: "action은 APPROVE 또는 REJECT 여야 합니다." }, { status: 400 });
    }

    if (action === "REJECT" && !rejectionReason?.trim()) {
      return NextResponse.json({ error: "거절 사유를 입력하세요." }, { status: 400 });
    }

    const result = await getPrisma().$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({
        where: { id: params.refundId },
        include: {
          payment: {
            include: {
              refunds: {
                where: { status: { in: ["APPROVED", "COMPLETED"] } },
                select: { amount: true },
              },
            },
          },
        },
      });

      if (!refund) throw new Error("환불 내역을 찾을 수 없습니다.");
      if (refund.paymentId !== params.id) {
        throw new Error("해당 수납 내역의 환불 요청이 아닙니다.");
      }
      if (refund.status !== "PENDING") {
        throw new Error("대기 중인 환불 요청만 처리할 수 있습니다.");
      }

      const now = new Date();
      const adminId = auth.context.adminUser.id;

      if (action === "APPROVE") {
        const updatedRefund = await tx.refund.update({
          where: { id: params.refundId },
          data: {
            status: "APPROVED" as RefundStatus,
            approvedBy: adminId,
            approvedAt: now,
          },
        });

        // 승인된 환불 합계 계산 (현재 요청 포함)
        const totalApproved =
          refund.payment.refunds.reduce((sum, r) => sum + r.amount, 0) + refund.amount;
        const newStatus: PaymentStatus =
          totalApproved >= refund.payment.netAmount ? "FULLY_REFUNDED" : "PARTIAL_REFUNDED";

        const updatedPayment = await tx.payment.update({
          where: { id: params.id },
          data: { status: newStatus },
        });

        await tx.auditLog.create({
          data: {
            adminId,
            action: "APPROVE_REFUND",
            targetType: "payment",
            targetId: params.id,
            after: {
              refundId: params.refundId,
              status: "APPROVED",
              newPaymentStatus: newStatus,
            },
            ipAddress: request.headers.get("x-forwarded-for"),
          },
        });

        return { refund: updatedRefund, payment: updatedPayment };
      } else {
        // REJECT
        const updatedRefund = await tx.refund.update({
          where: { id: params.refundId },
          data: {
            status: "REJECTED" as RefundStatus,
            rejectedBy: adminId,
            rejectedAt: now,
            rejectionReason: rejectionReason!.trim(),
          },
        });

        await tx.auditLog.create({
          data: {
            adminId,
            action: "REJECT_REFUND",
            targetType: "payment",
            targetId: params.id,
            after: {
              refundId: params.refundId,
              status: "REJECTED",
              rejectionReason: rejectionReason!.trim(),
            },
            ipAddress: request.headers.get("x-forwarded-for"),
          },
        });

        return { refund: updatedRefund, payment: refund.payment };
      }
    });

    // 승인 시 환불 완료 알림 발송 (fire-and-forget)
    if (action === "APPROVE") {
      const paymentData = await getPrisma().payment.findUnique({
        where: { id: params.id },
        select: { examNumber: true, student: { select: { name: true } } },
      });
      if (paymentData?.examNumber) {
        void sendEventNotification({
          examNumber: paymentData.examNumber,
          type: "REFUND_COMPLETE",
          messageInput: {
            studentName: paymentData.student?.name ?? paymentData.examNumber,
            refundAmount: result.refund.amount.toLocaleString(),
          },
          dedupeKey: `refund_complete:${params.refundId}`,
        });
      }
    }

    return NextResponse.json({ data: { id: result.refund.id, status: result.refund.status } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "처리 실패" },
      { status: 400 },
    );
  }
}
