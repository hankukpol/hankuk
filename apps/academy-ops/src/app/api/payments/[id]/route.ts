import { AdminRole, PaymentCategory, PaymentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { requireVisibleAcademyId, resolveVisibleAcademyId } from "@/lib/academy-scope";
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
  notFound: "결제 내역을 찾을 수 없습니다.",
  academyMismatch: "해당 지점의 학생만 선택할 수 있습니다.",
  lockedAmount: "확정된 결제는 금액을 수정할 수 없습니다. 환불 처리로 진행해 주세요.",
  updateFailed: "결제 정보 수정에 실패했습니다.",
  courseUnknown: "과정 미지정",
} as const;

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

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const academyId = resolveVisibleAcademyId(auth.context);
  const prisma = getPrisma();
  const payment =
    academyId === null
      ? await prisma.payment.findUnique({
          where: { id: params.id },
          include: createPaymentInclude(academyId),
        })
      : await prisma.payment.findFirst({
          where: { id: params.id, academyId },
          include: createPaymentInclude(academyId),
        });

  if (!payment) {
    return NextResponse.json({ error: TEXT.notFound }, { status: 404 });
  }

  const paymentData = mapPaymentRecord(payment);
  return NextResponse.json({ data: { payment: paymentData }, payment: paymentData });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const prisma = getPrisma();
  const academyId = requireVisibleAcademyId(auth.context);

  try {
    const body = await request.json();
    const { note, status, examNumber, category, processedAt, grossAmount } = body;

    const existing = await prisma.payment.findFirst({
      where: { id: params.id, academyId },
    });

    if (!existing) {
      return NextResponse.json({ error: TEXT.notFound }, { status: 404 });
    }

    if (examNumber !== undefined && examNumber !== null) {
      const student = await prisma.student.findFirst({
        where: { examNumber: String(examNumber), academyId },
        select: { examNumber: true },
      });
      if (!student) {
        return NextResponse.json({ error: TEXT.academyMismatch }, { status: 400 });
      }
    }

    if (grossAmount !== undefined && existing.status !== "PENDING") {
      return NextResponse.json({ error: TEXT.lockedAmount }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (note !== undefined) updateData.note = note?.trim() || null;
    if (status !== undefined) updateData.status = status as PaymentStatus;
    if (examNumber !== undefined) updateData.examNumber = examNumber ?? null;
    if (category !== undefined) updateData.category = category as PaymentCategory;
    if (processedAt !== undefined) {
      updateData.processedAt = processedAt ? new Date(processedAt as string) : undefined;
    }

    if (grossAmount !== undefined && existing.status === "PENDING") {
      const grossNum = Number(grossAmount);
      updateData.grossAmount = grossNum;
      updateData.netAmount = grossNum - (existing.discountAmount + existing.couponAmount + existing.pointAmount);
    }

    const payment = await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: params.id },
        data: updateData,
        include: createPaymentInclude(academyId),
      });

      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "UPDATE_PAYMENT",
          targetType: "payment",
          targetId: updated.id,
          before: {
            note: existing.note,
            status: existing.status,
            examNumber: existing.examNumber,
            category: existing.category,
            processedAt: existing.processedAt,
            grossAmount: existing.grossAmount,
          },
          after: {
            note: updated.note,
            status: updated.status,
            examNumber: updated.examNumber,
            category: updated.category,
            processedAt: updated.processedAt,
            grossAmount: updated.grossAmount,
          },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });

      return updated;
    });

    const paymentData = mapPaymentRecord(payment);
    return NextResponse.json({ data: { payment: paymentData }, payment: paymentData });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : TEXT.updateFailed },
      { status: 400 },
    );
  }
}