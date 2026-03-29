/**
 * POST /api/payments/card-initiate
 *
 * 카드 결제 시작 전 처리:
 *  1. Payment 레코드를 PENDING 상태로 생성
 *  2. idempotencyKey를 paymentUid로 활용(PortOne 주문 ID)
 *  3. 클라이언트에 PortOne SDK 호출에 필요한 데이터 반환
 */
import { randomUUID } from "crypto";
import { AdminRole, PaymentCategory } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { DEFAULT_SYSTEM_NAME } from "@/lib/academy-branding";
import { requireVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";

type CardInitiateBody = {
  enrollmentId?: string;
  amount: number;
  category?: string;
  studentExamNumber?: string;
  note?: string;
  items?: Array<{
    itemType: string;
    itemId?: string;
    itemName: string;
    unitPrice: number;
    quantity: number;
    amount: number;
  }>;
};

export async function POST(req: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: CardInitiateBody;

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

  const {
    enrollmentId,
    amount,
    category = "TUITION",
    studentExamNumber,
    note,
    items,
  } = body;

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "결제 금액을 입력해 주세요." }, { status: 400 });
  }

  const prisma = getPrisma();
  const requestedExamNumber = studentExamNumber?.trim() || null;
  const requestedEnrollmentId = enrollmentId?.trim() || null;

  let resolvedExamNumber = requestedExamNumber;
  let resolvedEnrollmentId = requestedEnrollmentId;
  let buyerName = "고객";
  let buyerPhone = "";

  if (resolvedEnrollmentId) {
    const enrollment = await prisma.courseEnrollment.findFirst({
      where: { id: resolvedEnrollmentId, academyId },
      select: { id: true, examNumber: true },
    });

    if (!enrollment) {
      return NextResponse.json(
        { error: "해당 지점의 수강 등록만 결제할 수 있습니다." },
        { status: 404 },
      );
    }

    if (resolvedExamNumber && resolvedExamNumber !== enrollment.examNumber) {
      return NextResponse.json(
        { error: "수강 등록과 학생 정보가 일치하지 않습니다." },
        { status: 400 },
      );
    }

    resolvedExamNumber = enrollment.examNumber;
    resolvedEnrollmentId = enrollment.id;
  }

  if (resolvedExamNumber) {
    const student = await prisma.student.findFirst({
      where: { examNumber: resolvedExamNumber, academyId },
      select: { name: true, phone: true },
    });

    if (!student) {
      return NextResponse.json(
        { error: "해당 지점 학생만 결제할 수 있습니다." },
        { status: 404 },
      );
    }

    buyerName = student.name;
    buyerPhone = student.phone ?? "";
  }

  const paymentUid = `card-${randomUUID().replace(/-/g, "").slice(0, 20)}`;

  const itemsToCreate =
    items && items.length > 0
      ? items.map((item) => ({
          itemType: item.itemType as PaymentCategory,
          itemId: item.itemId ?? null,
          itemName: item.itemName,
          unitPrice: Number(item.unitPrice),
          quantity: Number(item.quantity ?? 1),
          amount: Number(item.amount),
        }))
      : [
          {
            itemType: category as PaymentCategory,
            itemId: resolvedEnrollmentId ?? null,
            itemName: "카드 결제",
            unitPrice: amount,
            quantity: 1,
            amount,
          },
        ];

  const payment = await prisma.payment.create({
    data: {
      academyId,
      idempotencyKey: paymentUid,
      examNumber: resolvedExamNumber,
      enrollmentId: resolvedEnrollmentId,
      category: category as PaymentCategory,
      method: "CARD",
      status: "PENDING",
      grossAmount: amount,
      discountAmount: 0,
      couponAmount: 0,
      pointAmount: 0,
      netAmount: amount,
      note: note?.trim() ?? null,
      processedBy: auth.context.adminUser.id,
      processedAt: new Date(),
      items: {
        create: itemsToCreate,
      },
    },
  });

  const storeName = process.env.PORTONE_STORE_NAME ?? DEFAULT_SYSTEM_NAME;

  return NextResponse.json({
    data: {
      paymentId: payment.id,
      paymentUid,
      amount,
      storeName,
      buyerName,
      buyerPhone,
    },
  });
}
