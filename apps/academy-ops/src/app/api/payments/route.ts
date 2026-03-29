import { AdminRole, PaymentCategory, PaymentMethod, PaymentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  applyAcademyScope,
  requireVisibleAcademyId,
  resolveVisibleAcademyId,
} from "@/lib/academy-scope";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { sendEventNotification } from "@/lib/notifications/event-notify";
import { normalizeInstallmentSchedule } from "@/lib/payments/installment-schedule";
import { getPrisma } from "@/lib/prisma";

function createPaymentInclude(academyId: number | null) {
  return {
    student: {
      select: {
        name: true,
        phone: true,
        courseEnrollments: {
          ...(academyId === null ? {} : { where: { academyId } }),
          orderBy: [{ createdAt: "desc" as const }],
          select: {
            id: true,
            status: true,
            cohort: { select: { name: true } },
            product: { select: { name: true } },
            specialLecture: { select: { name: true } },
          },
        },
      },
    },
    processor: { select: { name: true } },
    items: { orderBy: { id: "asc" as const } },
    refunds: { select: { amount: true, refundType: true, processedAt: true } },
    installments: { orderBy: { seq: "asc" as const } },
  };
}

const TEXT = {
  missingCategory: "결제 유형을 선택해 주세요.",
  missingMethod: "결제 수단을 선택해 주세요.",
  invalidGrossAmount: "총 결제 금액을 확인해 주세요.",
  invalidNetAmount: "최종 납부 금액을 확인해 주세요.",
  missingItems: "결제 항목을 1개 이상 입력해 주세요.",
  unsupportedMethod: "현재는 현금과 계좌이체만 지원합니다.",
  tuitionOnlyInstallments: "분할 계획은 수강료 결제에서만 등록할 수 있습니다.",
  createFailed: "결제 등록에 실패했습니다.",
  courseUnknown: "과정 미지정",
  academyMismatch: "해당 지점의 학생만 결제 등록할 수 있습니다.",
  enrollmentMismatch: "해당 지점의 수강 등록만 연결할 수 있습니다.",
} as const;

type PaymentItemInput = {
  itemType: PaymentCategory;
  itemId?: string;
  itemName: string;
  unitPrice: number;
  quantity: number;
  amount: number;
};

function courseNameOf(item: {
  cohort?: { name: string } | null;
  product?: { name: string } | null;
  specialLecture?: { name: string } | null;
}) {
  return item.cohort?.name ?? item.product?.name ?? item.specialLecture?.name ?? TEXT.courseUnknown;
}

function mapStudent(student: any) {
  if (!student) return null;

  return {
    name: student.name,
    phone: student.phone,
    enrollments: student.courseEnrollments.map((enrollment: any) => ({
      id: enrollment.id,
      status: enrollment.status,
      label: courseNameOf(enrollment),
    })),
  };
}

function mapPaymentRecord(payment: any) {
  return {
    ...payment,
    student: mapStudent(payment.student),
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const prisma = getPrisma();
  const academyId = resolveVisibleAcademyId(auth.context);
  const sp = request.nextUrl.searchParams;
  const examNumber = sp.get("examNumber") ?? undefined;
  const category = sp.get("category") as PaymentCategory | null;
  const method = sp.get("method") as PaymentMethod | null;
  const status = sp.get("status") as PaymentStatus | null;
  const from = sp.get("from") ?? undefined;
  const to = sp.get("to") ?? undefined;
  const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);
  const limit = Math.min(Math.max(Number(sp.get("limit") ?? "50") || 50, 1), 200);
  const skip = (page - 1) * limit;

  const fromDate = from ? new Date(`${from}T00:00:00`) : undefined;
  const toDate = to ? new Date(`${to}T23:59:59.999`) : undefined;

  const where = applyAcademyScope(
    {
      ...(examNumber ? { examNumber } : {}),
      ...(category ? { category } : {}),
      ...(method ? { method } : {}),
      ...(status ? { status } : {}),
      ...(fromDate || toDate
        ? {
            processedAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    },
    academyId,
  );

  const [payments, total, aggregate, refundAggregate] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      include: createPaymentInclude(academyId),
      orderBy: { processedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.payment.count({ where }),
    prisma.payment.aggregate({
      where,
      _sum: { grossAmount: true, netAmount: true },
    }),
    prisma.refund.aggregate({
      where: { payment: where },
      _sum: { amount: true },
    }),
  ]);

  const summary = {
    gross: aggregate._sum.grossAmount ?? 0,
    net: aggregate._sum.netAmount ?? 0,
    refund: refundAggregate._sum.amount ?? 0,
  };

  const paymentData = payments.map(mapPaymentRecord);

  return NextResponse.json({
    data: { payments: paymentData, total, summary },
    payments: paymentData,
    total,
    summary,
  });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const prisma = getPrisma();
  const academyId = requireVisibleAcademyId(auth.context);

  try {
    const idempotencyKey = request.headers.get("X-Idempotency-Key") ?? undefined;

    if (idempotencyKey) {
      const existing = await prisma.payment.findUnique({
        where: { idempotencyKey },
        include: createPaymentInclude(academyId),
      });

      if (existing) {
        const paymentData = mapPaymentRecord(existing);
        return NextResponse.json({ data: { payment: paymentData }, payment: paymentData });
      }
    }

    const body = await request.json();
    const {
      examNumber,
      enrollmentId,
      category,
      method,
      grossAmount,
      discountAmount,
      netAmount,
      note,
      items,
      installments,
      cashReceiptType,
      cashReceiptNo,
      cashReceiptIssuedAt,
    } = body;

    if (!category) throw new Error(TEXT.missingCategory);
    if (!method) throw new Error(TEXT.missingMethod);
    if (grossAmount === undefined || grossAmount === null || Number(grossAmount) < 0) {
      throw new Error(TEXT.invalidGrossAmount);
    }
    if (netAmount === undefined || netAmount === null || Number(netAmount) < 0) {
      throw new Error(TEXT.invalidNetAmount);
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error(TEXT.missingItems);
    }

    const allowedMethods: PaymentMethod[] = ["CASH", "TRANSFER"];
    if (!allowedMethods.includes(method as PaymentMethod)) {
      throw new Error(TEXT.unsupportedMethod);
    }

    const netAmountNumber = Number(netAmount);
    const normalizedInstallments =
      Array.isArray(installments) && installments.length > 0
        ? normalizeInstallmentSchedule(installments, netAmountNumber, { minCount: 2 })
        : [];

    if (normalizedInstallments.length > 0 && category !== "TUITION") {
      throw new Error(TEXT.tuitionOnlyInstallments);
    }

    if (examNumber?.trim()) {
      const student = await prisma.student.findFirst({
        where: { examNumber: examNumber.trim(), academyId },
        select: { examNumber: true },
      });
      if (!student) {
        throw new Error(TEXT.academyMismatch);
      }
    }

    if (enrollmentId) {
      const enrollment = await prisma.courseEnrollment.findFirst({
        where: { id: String(enrollmentId), academyId },
        select: { id: true },
      });
      if (!enrollment) {
        throw new Error(TEXT.enrollmentMismatch);
      }
    }

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          academyId,
          idempotencyKey: idempotencyKey ?? null,
          examNumber: examNumber?.trim() || null,
          enrollmentId: enrollmentId ?? null,
          category: category as PaymentCategory,
          method: method as PaymentMethod,
          status: "APPROVED",
          grossAmount: Number(grossAmount),
          discountAmount: Number(discountAmount ?? 0),
          couponAmount: 0,
          pointAmount: 0,
          netAmount: netAmountNumber,
          note: note?.trim() || null,
          cashReceiptType:
            typeof cashReceiptType === "string" && cashReceiptType !== "NONE"
              ? cashReceiptType
              : null,
          cashReceiptNo:
            typeof cashReceiptNo === "string" && cashReceiptNo.trim()
              ? cashReceiptNo.trim()
              : null,
          cashReceiptIssuedAt: cashReceiptIssuedAt ? new Date(cashReceiptIssuedAt as string) : null,
          processedBy: auth.context.adminUser.id,
          processedAt: new Date(),
          items: {
            create: (items as PaymentItemInput[]).map((item) => ({
              itemType: item.itemType as PaymentCategory,
              itemId: item.itemId ?? null,
              itemName: item.itemName,
              unitPrice: Number(item.unitPrice),
              quantity: Number(item.quantity ?? 1),
              amount: Number(item.amount),
            })),
          },
          installments:
            normalizedInstallments.length > 0
              ? {
                  create: normalizedInstallments.map((installment, index) => ({
                    seq: index + 1,
                    amount: installment.amount,
                    dueDate: installment.dueDate,
                  })),
                }
              : undefined,
        },
        include: createPaymentInclude(academyId),
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "CREATE_PAYMENT",
          targetType: "payment",
          targetId: created.id,
          after: {
            examNumber: created.examNumber,
            category: created.category,
            method: created.method,
            grossAmount: created.grossAmount,
            netAmount: created.netAmount,
            installments: normalizedInstallments.map((installment, index) => ({
              seq: index + 1,
              amount: installment.amount,
              dueDate: installment.dueDate.toISOString(),
            })),
          },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return created;
    });

    const paymentData = mapPaymentRecord(payment);

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

    return NextResponse.json({ data: { payment: paymentData }, payment: paymentData }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : TEXT.createFailed },
      { status: 400 },
    );
  }
}