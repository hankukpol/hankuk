import { AdminRole, EnrollmentStatus, PaymentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  applyAcademyScope,
  resolveVisibleAcademyId,
} from "@/lib/academy-scope";
import {
  COURSE_TYPE_LABEL,
  ENROLLMENT_STATUS_COLOR,
  ENROLLMENT_STATUS_LABEL,
  EXAM_CATEGORY_LABEL,
  PAYMENT_METHOD_LABEL,
} from "@/lib/constants";
import { getPrisma } from "@/lib/prisma";

function parseDateParam(param: string | null): Date {
  if (param) {
    const parsed = new Date(param + "T00:00:00");
    if (!isNaN(parsed.getTime())) return parsed;
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
}

const PAID_PAYMENT_STATUSES: PaymentStatus[] = [
  PaymentStatus.APPROVED,
  PaymentStatus.PARTIAL_REFUNDED,
];
const ACTIVE_ENROLLMENT_STATUSES: EnrollmentStatus[] = [
  EnrollmentStatus.ACTIVE,
  EnrollmentStatus.PENDING,
  EnrollmentStatus.WAITING,
  EnrollmentStatus.SUSPENDED,
];

function courseNameOf(item: {
  cohort?: { name: string | null; examCategory?: keyof typeof EXAM_CATEGORY_LABEL | null } | null;
  product?: { name: string; examCategory?: keyof typeof EXAM_CATEGORY_LABEL } | null;
  specialLecture?: {
    name: string;
    examCategory?: keyof typeof EXAM_CATEGORY_LABEL | null;
  } | null;
  courseType?: keyof typeof COURSE_TYPE_LABEL;
}) {
  return (
    item.cohort?.name ??
    item.product?.name ??
    item.specialLecture?.name ??
    (item.courseType ? COURSE_TYPE_LABEL[item.courseType] : "과정 미지정")
  );
}

function resolveExamCategoryLabel(item: {
  cohort?: { examCategory: keyof typeof EXAM_CATEGORY_LABEL } | null;
  product?: { examCategory: keyof typeof EXAM_CATEGORY_LABEL } | null;
  specialLecture?: { examCategory: keyof typeof EXAM_CATEGORY_LABEL | null } | null;
}) {
  const examCategory =
    item.cohort?.examCategory ?? item.product?.examCategory ?? item.specialLecture?.examCategory;
  return examCategory ? EXAM_CATEGORY_LABEL[examCategory] : "기타";
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const date = parseDateParam(sp.get("date"));
  const academyId = resolveVisibleAcademyId(auth.context);

  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  const prisma = getPrisma();
  const [payments, settlement, enrollmentsForDay] = await prisma.$transaction([
    prisma.payment.findMany({
      where: applyAcademyScope(
        {
          status: { in: PAID_PAYMENT_STATUSES },
          processedAt: { gte: startOfDay, lte: endOfDay },
        },
        academyId,
      ),
      include: {
        student: {
          select: {
            name: true,
            examNumber: true,
            phone: true,
            courseEnrollments: {
              where: applyAcademyScope(
                {
                  status: { in: ACTIVE_ENROLLMENT_STATUSES },
                },
                academyId,
              ),
              orderBy: [{ createdAt: "desc" }],
              take: 4,
              select: {
                id: true,
                courseType: true,
                status: true,
                cohort: { select: { name: true } },
                product: { select: { name: true } },
                specialLecture: { select: { name: true } },
              },
            },
          },
        },
        processor: { select: { name: true } },
        items: true,
        refunds: { select: { amount: true, refundType: true, processedAt: true } },
      },
      orderBy: { processedAt: "desc" },
      take: 20,
    }),
    prisma.dailySettlement.findUnique({
      where: { date: new Date(dateStr) },
    }),
    prisma.courseEnrollment.findMany({
      where: applyAcademyScope(
        {
          createdAt: { gte: startOfDay, lte: endOfDay },
        },
        academyId,
      ),
      orderBy: [{ createdAt: "desc" }],
      include: {
        student: {
          select: {
            examNumber: true,
            name: true,
            phone: true,
            courseEnrollments: {
              where: applyAcademyScope(
                {
                  status: { in: ACTIVE_ENROLLMENT_STATUSES },
                },
                academyId,
              ),
              orderBy: [{ createdAt: "desc" }],
              take: 4,
              select: {
                id: true,
                courseType: true,
                status: true,
                cohort: { select: { name: true } },
                product: { select: { name: true } },
                specialLecture: { select: { name: true } },
              },
            },
          },
        },
        cohort: { select: { name: true, examCategory: true } },
        product: { select: { name: true, examCategory: true } },
        specialLecture: { select: { name: true, examCategory: true } },
        staff: { select: { name: true } },
      },
    }),
  ]);

  // Resolve closedBy / reopenedBy names
  const adminIds = [
    settlement?.closedBy,
    settlement?.reopenedBy,
  ].filter((id): id is string => !!id);

  const adminUsers = adminIds.length > 0
    ? await prisma.adminUser.findMany({
        where: { id: { in: adminIds } },
        select: { id: true, name: true },
      })
    : [];

  const adminNameMap: Record<string, string> = {};
  for (const u of adminUsers) adminNameMap[u.id] = u.name;

  const settlementWithNames = settlement
    ? {
        ...settlement,
        closedByName: settlement.closedBy ? (adminNameMap[settlement.closedBy] ?? null) : null,
        reopenedByName: settlement.reopenedBy ? (adminNameMap[settlement.reopenedBy] ?? null) : null,
      }
    : null;

  // Aggregate all payments for the day (not just top 20)
  const allPayments = await prisma.payment.findMany({
    where: applyAcademyScope(
      {
        status: { in: PAID_PAYMENT_STATUSES },
        processedAt: { gte: startOfDay, lte: endOfDay },
      },
      academyId,
    ),
    select: {
      category: true,
      method: true,
      grossAmount: true,
      netAmount: true,
    },
  });

  // Category breakdown
  const categoryMap: Record<
    string,
    { count: number; gross: number }
  > = {};
  for (const p of allPayments) {
    if (!categoryMap[p.category]) {
      categoryMap[p.category] = { count: 0, gross: 0 };
    }
    categoryMap[p.category].count += 1;
    categoryMap[p.category].gross += p.grossAmount;
  }

  // Method breakdown
  const methodMap: Record<string, { count: number; amount: number }> = {};
  for (const p of allPayments) {
    if (!methodMap[p.method]) {
      methodMap[p.method] = { count: 0, amount: 0 };
    }
    methodMap[p.method].count += 1;
    methodMap[p.method].amount += p.netAmount;
  }

  // Refunds from Refund table for the day
  const refundAgg = await prisma.refund.aggregate({
    where: {
      processedAt: { gte: startOfDay, lte: endOfDay },
      ...(academyId === null ? {} : { payment: { academyId } }),
    },
    _sum: { amount: true },
  });
  const refundTotal = refundAgg._sum.amount ?? 0;

  const grossTotal = allPayments.reduce((s, p) => s + p.grossAmount, 0);
  const netTotal = grossTotal - refundTotal;
  const totalCount = allPayments.length;

  const summary = {
    tuition: categoryMap["TUITION"] ?? { count: 0, gross: 0 },
    facility: categoryMap["FACILITY"] ?? { count: 0, gross: 0 },
    textbook: categoryMap["TEXTBOOK"] ?? { count: 0, gross: 0 },
    material: categoryMap["MATERIAL"] ?? { count: 0, gross: 0 },
    singleCourse: categoryMap["SINGLE_COURSE"] ?? { count: 0, gross: 0 },
    penalty: categoryMap["PENALTY"] ?? { count: 0, gross: 0 },
    etc: categoryMap["ETC"] ?? { count: 0, gross: 0 },
    totalCount,
    grossTotal,
    refundTotal,
    netTotal,
  };

  const methods = {
    cash: methodMap["CASH"] ?? { count: 0, amount: 0 },
    card: methodMap["CARD"] ?? { count: 0, amount: 0 },
    transfer: methodMap["TRANSFER"] ?? { count: 0, amount: 0 },
  };

  const enrollmentIds = enrollmentsForDay.map((enrollment) => enrollment.id);
  const paymentsByEnrollment = enrollmentIds.length
    ? await prisma.payment.findMany({
        where: applyAcademyScope(
          {
            enrollmentId: { in: enrollmentIds },
            status: { in: PAID_PAYMENT_STATUSES },
          },
          academyId,
        ),
        include: {
          items: {
            select: {
              itemType: true,
              amount: true,
            },
          },
        },
      })
    : [];

  const paymentMap = new Map<string, typeof paymentsByEnrollment>();
  for (const payment of paymentsByEnrollment) {
    if (!payment.enrollmentId) continue;
    const bucket = paymentMap.get(payment.enrollmentId) ?? [];
    bucket.push(payment);
    paymentMap.set(payment.enrollmentId, bucket);
  }

  return NextResponse.json({
    date: dateStr,
    summary,
    methods,
    settlement: settlementWithNames,
    recentPayments: payments.map((payment) => ({
      ...payment,
      student: payment.student
        ? {
            ...payment.student,
            courseEnrollments: payment.student.courseEnrollments.map((enrollment) => ({
              ...enrollment,
              courseName: courseNameOf(enrollment),
              statusLabel: ENROLLMENT_STATUS_LABEL[enrollment.status],
              statusTone: ENROLLMENT_STATUS_COLOR[enrollment.status],
            })),
          }
        : null,
    })),
    dailyEnrollments: enrollmentsForDay.map((enrollment) => {
      const linkedPayments = paymentMap.get(enrollment.id) ?? [];
      const textbookAmount = linkedPayments.reduce(
        (sum, payment) =>
          sum +
          payment.items.reduce(
            (itemSum, item) => itemSum + (item.itemType === "TEXTBOOK" ? item.amount : 0),
            0,
          ),
        0,
      );
      const paymentAmount = linkedPayments.reduce((sum, payment) => sum + payment.netAmount, 0);
      const methodLabel =
        linkedPayments.length > 0
          ? Array.from(new Set(linkedPayments.map((payment) => PAYMENT_METHOD_LABEL[payment.method]))).join(" + ")
          : "미수납";
      const cashReceiptNo =
        linkedPayments.find((payment) => payment.cashReceiptNo)?.cashReceiptNo ?? null;

      return {
        id: enrollment.id,
        enrollNumber: enrollment.id.slice(-8).toUpperCase(),
        examNumber: enrollment.student.examNumber,
        name: enrollment.student.name,
        mobile: enrollment.student.phone,
        courseName: courseNameOf(enrollment),
        examCategoryLabel: resolveExamCategoryLabel(enrollment),
        paymentAmount,
        textbookAmount,
        methodLabel,
        cashReceiptNo,
        registeredAt: enrollment.createdAt.toISOString(),
        registeredBy: enrollment.staff.name,
        enrollments: enrollment.student.courseEnrollments.map((item) => ({
          id: item.id,
          courseName: courseNameOf(item),
          statusLabel: ENROLLMENT_STATUS_LABEL[item.status],
          statusTone: ENROLLMENT_STATUS_COLOR[item.status],
        })),
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const prisma = getPrisma();
    const body = await request.json();
    const { date, cashActual, reopenReason } = body as {
      date: string;
      cashActual: number;
      reopenReason?: string;
    };

    if (!date) throw new Error("날짜를 입력하세요.");
    if (cashActual === undefined || cashActual === null)
      throw new Error("현금 실제액을 입력하세요.");

    const dateObj = new Date(date + "T00:00:00");
    if (isNaN(dateObj.getTime())) throw new Error("날짜 형식이 올바르지 않습니다.");

    const startOfDay = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 23, 59, 59, 999);

    const academyId = resolveVisibleAcademyId(auth.context);

    // Check if already closed
    const existing = await prisma.dailySettlement.findUnique({
      where: { date: dateObj },
    });

    const userRole = auth.context.adminUser.role;
    const canReopen =
      userRole === AdminRole.SUPER_ADMIN || userRole === AdminRole.DIRECTOR;

    const isReopening = !!(existing?.closedAt);

    if (isReopening && !canReopen) {
      return NextResponse.json(
        { error: "이미 마감된 일계표입니다. 원장 이상만 재마감할 수 있습니다." },
        { status: 403 },
      );
    }

    if (isReopening && !reopenReason?.trim()) {
      return NextResponse.json(
        { error: "재오픈 사유를 입력하세요." },
        { status: 400 },
      );
    }

    // Aggregate payments
    const allPayments = await prisma.payment.findMany({
      where: applyAcademyScope(
        {
          status: { in: PAID_PAYMENT_STATUSES },
          processedAt: { gte: startOfDay, lte: endOfDay },
        },
        academyId,
      ),
      select: {
        category: true,
        method: true,
        grossAmount: true,
        netAmount: true,
      },
    });

    const refundAgg = await prisma.refund.aggregate({
      where: {
        processedAt: { gte: startOfDay, lte: endOfDay },
        ...(academyId === null ? {} : { payment: { academyId } }),
      },
      _sum: { amount: true },
    });
    const refundTotal = refundAgg._sum.amount ?? 0;

    const grossTotal = allPayments.reduce((s, p) => s + p.grossAmount, 0);
    const netTotal = grossTotal - refundTotal;

    const byCategory = (cat: string) =>
      allPayments.filter((p) => p.category === cat).reduce((s, p) => s + p.grossAmount, 0);

    const byMethod = (method: string) =>
      allPayments.filter((p) => p.method === method).reduce((s, p) => s + p.netAmount, 0);

    const tuitionTotal = byCategory("TUITION");
    const facilityTotal = byCategory("FACILITY");
    const textbookTotal = byCategory("TEXTBOOK");
    const posTotal = byCategory("SINGLE_COURSE");
    const etcTotal =
      byCategory("ETC") + byCategory("MATERIAL") + byCategory("PENALTY");

    const cashAmount = byMethod("CASH");
    const cardAmount = byMethod("CARD");
    const transferAmount = byMethod("TRANSFER");
    const cashDiff = Number(cashActual) - cashAmount;

    const now = new Date();
    const adminId = auth.context.adminUser.id;

    const settlement = await prisma.dailySettlement.upsert({
      where: { date: dateObj },
      create: {
        date: dateObj,
        tuitionTotal,
        facilityTotal,
        textbookTotal,
        posTotal,
        etcTotal,
        grossTotal,
        refundTotal,
        netTotal,
        cashAmount,
        cardAmount,
        transferAmount,
        cashActual: Number(cashActual),
        cashDiff,
        closedAt: now,
        closedBy: adminId,
      },
      update: {
        tuitionTotal,
        facilityTotal,
        textbookTotal,
        posTotal,
        etcTotal,
        grossTotal,
        refundTotal,
        netTotal,
        cashAmount,
        cardAmount,
        transferAmount,
        cashActual: Number(cashActual),
        cashDiff,
        closedAt: now,
        closedBy: adminId,
        ...(isReopening
          ? {
              reopenedAt: now,
              reopenedBy: adminId,
              reopenReason: reopenReason!.trim(),
            }
          : {}),
      },
    });

    return NextResponse.json({ settlement });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "마감 처리 실패" },
      { status: 400 },
    );
  }
}
