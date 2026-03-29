import { AdminRole, PaymentCategory, PaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { sendEventNotification } from "@/lib/notifications/event-notify";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";

const ALLOWED_METHODS: PaymentMethod[] = ["CASH", "CARD", "TRANSFER"];

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const idempotencyKey = request.headers.get("X-Idempotency-Key") ?? undefined;

    // Check idempotency
    if (idempotencyKey) {
      const existing = await getPrisma().payment.findUnique({
        where: { idempotencyKey },
        include: {
          student: { select: { name: true, phone: true } },
          processor: { select: { name: true } },
          items: true,
        },
      });
      if (existing) {
        return NextResponse.json({ payment: existing });
      }
    }

    const body = await request.json();
    const {
      examNumber,
      category,
      method,
      grossAmount,
      discountAmount,
      netAmount,
      note,
      items,
    } = body;

    if (category !== "SINGLE_COURSE") {
      throw new Error("POS 결제는 단과(SINGLE_COURSE) 유형만 처리합니다.");
    }
    if (!method || !ALLOWED_METHODS.includes(method as PaymentMethod)) {
      throw new Error("결제수단을 선택하세요. (현금·카드·계좌이체)");
    }
    if (grossAmount === undefined || grossAmount === null || Number(grossAmount) <= 0) {
      throw new Error("청구금액을 입력하세요.");
    }
    if (netAmount === undefined || netAmount === null || Number(netAmount) <= 0) {
      throw new Error("실납부금액은 0원보다 커야 합니다.");
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("결제 항목을 하나 이상 입력하세요.");
    }

    const payment = await getPrisma().$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          idempotencyKey: idempotencyKey ?? null,
          examNumber: examNumber?.trim() || null,
          enrollmentId: null,
          category: "SINGLE_COURSE" as PaymentCategory,
          method: method as PaymentMethod,
          status: "APPROVED",
          grossAmount: Number(grossAmount),
          discountAmount: Number(discountAmount ?? 0),
          couponAmount: 0,
          pointAmount: 0,
          netAmount: Number(netAmount),
          note: note?.trim() || null,
          processedBy: auth.context.adminUser.id,
          processedAt: new Date(),
          items: {
            create: (
              items as Array<{
                itemType: string;
                itemId?: string;
                itemName: string;
                unitPrice: number;
                quantity: number;
                amount: number;
              }>
            ).map((item) => ({
              itemType: (item.itemType as PaymentCategory) ?? "SINGLE_COURSE",
              itemId: item.itemId ?? null,
              itemName: item.itemName,
              unitPrice: Number(item.unitPrice),
              quantity: Number(item.quantity ?? 1),
              amount: Number(item.amount),
            })),
          },
        },
        include: {
          student: { select: { name: true, phone: true } },
          processor: { select: { name: true } },
          items: true,
        },
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "CREATE_POS_PAYMENT",
          targetType: "payment",
          targetId: created.id,
          after: {
            examNumber: created.examNumber,
            category: created.category,
            method: created.method,
            grossAmount: created.grossAmount,
            netAmount: created.netAmount,
          },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return created;
    });

    // 수납 완료 알림 발송 (fire-and-forget)
    if (payment.examNumber) {
      void sendEventNotification({
        examNumber: payment.examNumber,
        type: "PAYMENT_COMPLETE",
        messageInput: {
          studentName: payment.student?.name ?? payment.examNumber,
          paymentAmount: payment.netAmount.toLocaleString(),
          paymentMethod: PAYMENT_METHOD_LABEL[payment.method],
        },
        dedupeKey: `payment_complete:${payment.id}`,
      });
    }

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "결제 처리 실패" },
      { status: 400 },
    );
  }
}
