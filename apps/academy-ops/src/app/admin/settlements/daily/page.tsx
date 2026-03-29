import Link from "next/link";
import { AdminRole, EnrollmentStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import {
  applyAcademyScope,
  getAdminAcademyScope,
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
import { DailySettlementView } from "@/components/settlements/daily-settlement-view";

export const dynamic = "force-dynamic";

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

export default async function DailySettlementPage() {
  await requireAdminContext(AdminRole.COUNSELOR);
  const academyScope = await getAdminAcademyScope();
  const academyId = resolveVisibleAcademyId(academyScope);

  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const prisma = getPrisma();

  const [recentPayments, settlement, allPaymentsForDay, enrollmentsForDay] = await prisma.$transaction([
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
      where: { date: new Date(todayStr) },
    }),
    prisma.payment.findMany({
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

  const refundAgg = await prisma.refund.aggregate({
    where: {
      processedAt: { gte: startOfDay, lte: endOfDay },
      ...(academyId === null ? {} : { payment: { academyId } }),
    },
    _sum: { amount: true },
  });
  const refundTotal = refundAgg._sum.amount ?? 0;

  const categoryMap: Record<string, { count: number; gross: number }> = {};
  for (const p of allPaymentsForDay) {
    if (!categoryMap[p.category]) categoryMap[p.category] = { count: 0, gross: 0 };
    categoryMap[p.category].count += 1;
    categoryMap[p.category].gross += p.grossAmount;
  }

  const methodMap: Record<string, { count: number; amount: number }> = {};
  for (const p of allPaymentsForDay) {
    if (!methodMap[p.method]) methodMap[p.method] = { count: 0, amount: 0 };
    methodMap[p.method].count += 1;
    methodMap[p.method].amount += p.netAmount;
  }

  const grossTotal = allPaymentsForDay.reduce((s, p) => s + p.grossAmount, 0);

  const enrollmentPaymentIds = enrollmentsForDay.map((enrollment) => enrollment.id);
  const paymentsByEnrollment = enrollmentPaymentIds.length
    ? await prisma.payment.findMany({
        where: applyAcademyScope(
          {
            enrollmentId: { in: enrollmentPaymentIds },
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

  const initialData = {
    date: todayStr,
    summary: {
      tuition: categoryMap["TUITION"] ?? { count: 0, gross: 0 },
      facility: categoryMap["FACILITY"] ?? { count: 0, gross: 0 },
      textbook: categoryMap["TEXTBOOK"] ?? { count: 0, gross: 0 },
      material: categoryMap["MATERIAL"] ?? { count: 0, gross: 0 },
      singleCourse: categoryMap["SINGLE_COURSE"] ?? { count: 0, gross: 0 },
      penalty: categoryMap["PENALTY"] ?? { count: 0, gross: 0 },
      etc: categoryMap["ETC"] ?? { count: 0, gross: 0 },
      totalCount: allPaymentsForDay.length,
      grossTotal,
      refundTotal,
      netTotal: grossTotal - refundTotal,
    },
    methods: {
      cash: methodMap["CASH"] ?? { count: 0, amount: 0 },
      card: methodMap["CARD"] ?? { count: 0, amount: 0 },
      transfer: methodMap["TRANSFER"] ?? { count: 0, amount: 0 },
    },
    settlement: settlement
      ? {
          ...settlement,
          date: settlement.date.toISOString(),
          closedAt: settlement.closedAt?.toISOString() ?? null,
          closedByName: null,
          reopenedAt: settlement.reopenedAt?.toISOString() ?? null,
          reopenedByName: null,
          cashActual: settlement.cashActual ?? null,
          cashDiff: settlement.cashDiff ?? null,
        }
      : null,
    recentPayments: recentPayments.map((p) => ({
      ...p,
      processedAt: p.processedAt.toISOString(),
      refunds: p.refunds.map((r) => ({
        ...r,
        processedAt: r.processedAt.toISOString(),
      })),
      student: p.student
        ? {
            ...p.student,
            courseEnrollments: p.student.courseEnrollments.map((enrollment) => ({
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
  };

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 정산
      </div>
      <h1 className="mt-5 text-3xl font-semibold">일계표</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        날짜별 수납 집계와 당일 등록자 기준 일일 수강료 입금 내역서를 함께 확인합니다.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          prefetch={false}
          href={`/admin/payments/reconciliation?month=${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`}
          className="inline-flex items-center gap-2 rounded-full border border-ember/20 bg-ember/10 px-5 py-2.5 text-sm font-semibold text-ember transition hover:border-ember/40 hover:bg-ember/20"
        >
          대사 확인 →
        </Link>
        <Link
          prefetch={false}
          href="/admin/settlements/monthly"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-ink/30"
        >
          월계표 →
        </Link>
      </div>
      <div className="mt-8">
        <DailySettlementView initialData={initialData} />
      </div>
    </div>
  );
}
