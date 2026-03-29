import { AdminRole, PaymentStatus, RefundStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { sendEventNotification } from "@/lib/notifications/event-notify";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { action, note } = body as {
      action: "APPROVE" | "REJECT";
      note?: string;
    };

    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json(
        { error: "action은 APPROVE 또는 REJECT 여야 합니다." },
        { status: 400 },
      );
    }

    if (action === "REJECT" && !note?.trim()) {
      return NextResponse.json({ error: "반려 사유를 입력하세요." }, { status: 400 });
    }

    const refundId = params.id;
    const adminId = auth.context.adminUser.id;
    const now = new Date();

    const result = await getPrisma().$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({
        where: { id: refundId },
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
      if (refund.status !== "PENDING") {
        throw new Error("대기 중인 환불 요청만 처리할 수 있습니다.");
      }

      if (action === "APPROVE") {
        const updatedRefund = await tx.refund.update({
          where: { id: refundId },
          data: {
            status: "APPROVED" as RefundStatus,
            approvedBy: adminId,
            approvedAt: now,
          },
        });

        // Update payment status based on total approved refunds
        const totalApproved =
          refund.payment.refunds.reduce((sum, r) => sum + r.amount, 0) + refund.amount;
        const newStatus: PaymentStatus =
          totalApproved >= refund.payment.netAmount ? "FULLY_REFUNDED" : "PARTIAL_REFUNDED";

        await tx.payment.update({
          where: { id: refund.paymentId },
          data: { status: newStatus },
        });

        await tx.auditLog.create({
          data: {
            adminId,
            action: "REFUND_APPROVE",
            targetType: "refund",
            targetId: refundId,
            after: {
              refundId,
              status: "APPROVED",
              paymentId: refund.paymentId,
              newPaymentStatus: newStatus,
            },
            ipAddress: request.headers.get("x-forwarded-for"),
          },
        });

        return { refund: updatedRefund };
      } else {
        // REJECT
        const updatedRefund = await tx.refund.update({
          where: { id: refundId },
          data: {
            status: "REJECTED" as RefundStatus,
            rejectedBy: adminId,
            rejectedAt: now,
            rejectionReason: note!.trim(),
          },
        });

        await tx.auditLog.create({
          data: {
            adminId,
            action: "REFUND_REJECT",
            targetType: "refund",
            targetId: refundId,
            after: {
              refundId,
              status: "REJECTED",
              paymentId: refund.paymentId,
              rejectionReason: note!.trim(),
            },
            ipAddress: request.headers.get("x-forwarded-for"),
          },
        });

        return { refund: updatedRefund };
      }
    });

    // Send notification on approval (fire-and-forget)
    if (action === "APPROVE") {
      const paymentData = await getPrisma().refund.findUnique({
        where: { id: refundId },
        select: {
          amount: true,
          payment: {
            select: {
              examNumber: true,
              student: { select: { name: true } },
            },
          },
        },
      });
      if (paymentData?.payment.examNumber) {
        void sendEventNotification({
          examNumber: paymentData.payment.examNumber,
          type: "REFUND_COMPLETE",
          messageInput: {
            studentName:
              paymentData.payment.student?.name ?? paymentData.payment.examNumber,
            refundAmount: paymentData.amount.toLocaleString(),
          },
          dedupeKey: `refund_complete:${refundId}`,
        });
      }
    }

    return NextResponse.json({ data: { refund: result.refund } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "처리 실패" },
      { status: 400 },
    );
  }
}
