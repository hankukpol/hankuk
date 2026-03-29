/**
 * POST /api/payments/card-confirm
 *
 * PortOne 카드 결제 완료 후 서버 사이드 검증 및 Payment 상태 업데이트:
 *  1. paymentUid로 Payment 레코드 조회(idempotencyKey = paymentUid)
 *  2. PortOne API로 결제 검증(금액 일치 확인)
 *  3. Payment 상태를 APPROVED로 업데이트하고 PortOne 결제 ID를 note에 기록
 *  4. 수납 완료 알림 발송(fire-and-forget)
 */
import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { requireVisibleAcademyId } from "@/lib/academy-scope";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { sendEventNotification } from "@/lib/notifications/event-notify";
import { verifyPortOnePayment } from "@/lib/portone";
import { getPrisma } from "@/lib/prisma";

type CardConfirmBody = {
  paymentUid: string;
  portonePaymentId: string;
};

export async function POST(req: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: CardConfirmBody;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  let academyId: number;
  try {
    academyId = requireVisibleAcademyId(auth.context);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "지점 선택이 필요합니다." },
      { status: 400 },
    );
  }
  const { paymentUid, portonePaymentId } = body;

  if (!paymentUid?.trim()) {
    return NextResponse.json({ error: "paymentUid가 필요합니다." }, { status: 400 });
  }
  if (!portonePaymentId?.trim()) {
    return NextResponse.json({ error: "portonePaymentId가 필요합니다." }, { status: 400 });
  }

  const prisma = getPrisma();

  const payment = await prisma.payment.findFirst({
    where: { idempotencyKey: paymentUid, academyId },
    include: {
      student: { select: { name: true, phone: true } },
    },
  });

  if (!payment) {
    return NextResponse.json({ error: "결제 내역을 찾을 수 없습니다." }, { status: 404 });
  }

  if (payment.status === "APPROVED") {
    return NextResponse.json({
      data: { paymentId: payment.id, status: "APPROVED" },
    });
  }

  if (payment.status !== "PENDING") {
    return NextResponse.json(
      { error: `처리할 수 없는 결제 상태입니다: ${payment.status}` },
      { status: 400 },
    );
  }

  let verified: Awaited<ReturnType<typeof verifyPortOnePayment>>;
  try {
    verified = await verifyPortOnePayment(portonePaymentId);
  } catch (err) {
    console.error("[card-confirm] PortOne 결제 검증 실패:", err);
    return NextResponse.json(
      { error: "PortOne 결제 검증에 실패했습니다." },
      { status: 502 },
    );
  }

  if (verified.status !== "PAID") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "CANCELLED",
        note: `결제 실패 | PortOne 상태: ${verified.status} | ${portonePaymentId}`,
      },
    });

    return NextResponse.json(
      { error: `결제가 완료되지 않았습니다. 상태: ${verified.status}` },
      { status: 400 },
    );
  }

  const paidAmount = verified.amount.paid;
  if (paidAmount !== payment.netAmount) {
    console.error(
      `[card-confirm] 금액 불일치: paid=${paidAmount}, expected=${payment.netAmount} (paymentId: ${payment.id})`,
    );

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "CANCELLED",
        note: `금액 불일치 | paid=${paidAmount}, expected=${payment.netAmount} | ${portonePaymentId}`,
      },
    });

    return NextResponse.json({ error: "결제 금액이 일치하지 않습니다." }, { status: 400 });
  }

  const noteText = `카드 결제 | PortOne ID: ${portonePaymentId}${verified.orderName ? ` | ${verified.orderName}` : ""}`;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "APPROVED",
        note: noteText,
        processedAt: verified.paidAt ? new Date(verified.paidAt) : new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: auth.context.adminUser.id,
        action: "APPROVE_CARD_PAYMENT",
        targetType: "payment",
        targetId: payment.id,
        after: {
          portonePaymentId,
          amount: paidAmount,
          status: "APPROVED",
        },
        ipAddress: req.headers.get("x-forwarded-for"),
      },
    });

    return result;
  });

  if (updated.examNumber) {
    void sendEventNotification({
      examNumber: updated.examNumber,
      type: "PAYMENT_COMPLETE",
      messageInput: {
        studentName: payment.student?.name ?? updated.examNumber,
        paymentAmount: updated.netAmount.toLocaleString(),
        paymentMethod: PAYMENT_METHOD_LABEL[updated.method],
      },
      dedupeKey: `payment_complete:${updated.id}`,
    }).catch((err) => console.error("[card-confirm] 수납 알림 발송 실패:", err));
  }

  return NextResponse.json({
    data: { paymentId: updated.id, status: "APPROVED" },
  });
}
