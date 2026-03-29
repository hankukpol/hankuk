import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  MAX_INSTALLMENT_COUNT,
  normalizeInstallmentSchedule,
  type InstallmentScheduleDraft,
} from "@/lib/payments/installment-schedule";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const TEXT = {
  notFound: "수납 내역을 찾을 수 없습니다.",
  invalidBody: "분납 일정 정보를 다시 확인해 주세요.",
  noEditableRows: "이미 모두 납부된 분납 일정입니다.",
  refundedLocked: "환불이 시작된 수납 건은 분납 일정을 수정할 수 없습니다.",
  saveFailed: "분납 일정 수정에 실패했습니다.",
} as const;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as { installments?: InstallmentScheduleDraft[] } | null;

    if (!body || !Array.isArray(body.installments)) {
      return NextResponse.json({ error: TEXT.invalidBody }, { status: 400 });
    }

    const prisma = getPrisma();
    const payment = await prisma.payment.findUnique({
      where: { id },
      select: {
        id: true,
        examNumber: true,
        enrollmentId: true,
        status: true,
        netAmount: true,
        installments: {
          orderBy: { seq: "asc" },
          select: {
            id: true,
            seq: true,
            amount: true,
            dueDate: true,
            paidAt: true,
          },
        },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: TEXT.notFound }, { status: 404 });
    }

    if (payment.status !== "APPROVED") {
      return NextResponse.json({ error: TEXT.refundedLocked }, { status: 409 });
    }

    const paidInstallments = payment.installments.filter((installment) => installment.paidAt !== null);
    const unpaidInstallments = payment.installments.filter((installment) => installment.paidAt === null);

    if (unpaidInstallments.length === 0) {
      return NextResponse.json({ error: TEXT.noEditableRows }, { status: 409 });
    }

    const paidAmount = paidInstallments.reduce((sum, installment) => sum + installment.amount, 0);
    const outstandingAmount = payment.netAmount - paidAmount;
    const remainingSlots = MAX_INSTALLMENT_COUNT - paidInstallments.length;

    const normalized = normalizeInstallmentSchedule(body.installments, outstandingAmount, {
      minCount: 1,
      maxCount: Math.max(remainingSlots, 1),
    });

    const updatedInstallments = await prisma.$transaction(async (tx) => {
      await tx.installment.deleteMany({
        where: {
          paymentId: payment.id,
          paidAt: null,
        },
      });

      if (normalized.length > 0) {
        await tx.installment.createMany({
          data: normalized.map((installment, index) => ({
            paymentId: payment.id,
            seq: paidInstallments.length + index + 1,
            amount: installment.amount,
            dueDate: installment.dueDate,
          })),
        });
      }

      const refreshed = await tx.installment.findMany({
        where: { paymentId: payment.id },
        orderBy: { seq: "asc" },
        select: {
          id: true,
          seq: true,
          amount: true,
          dueDate: true,
          paidAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "UPDATE_PAYMENT_INSTALLMENTS",
          targetType: "payment",
          targetId: payment.id,
          before: {
            examNumber: payment.examNumber,
            enrollmentId: payment.enrollmentId,
            installments: payment.installments.map((installment) => ({
              id: installment.id,
              seq: installment.seq,
              amount: installment.amount,
              dueDate: installment.dueDate.toISOString(),
              paidAt: installment.paidAt?.toISOString() ?? null,
            })),
          },
          after: {
            examNumber: payment.examNumber,
            enrollmentId: payment.enrollmentId,
            installments: refreshed.map((installment) => ({
              id: installment.id,
              seq: installment.seq,
              amount: installment.amount,
              dueDate: installment.dueDate.toISOString(),
              paidAt: installment.paidAt?.toISOString() ?? null,
            })),
          },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return refreshed;
    });

    return NextResponse.json({ data: { installments: updatedInstallments } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : TEXT.saveFailed },
      { status: 400 },
    );
  }
}
