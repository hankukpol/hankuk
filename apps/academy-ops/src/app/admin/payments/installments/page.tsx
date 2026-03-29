import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import {
  InstallmentClient,
  type InstallmentDashboardRow,
  type InstallmentDashboardStats,
} from "./installment-client";
import {
  InstallmentManager,
  type InstallmentEnrollmentSummary,
  type InstallmentItem,
} from "./installment-manager";

export const dynamic = "force-dynamic";

const TEXT = {
  badge: "\uC218\uB0A9 \uAD00\uB9AC",
  title: "\uBD84\uD560 \uB0A9\uBD80 \uB300\uC2DC\uBCF4\uB4DC",
  description: "\uBD84\uD560 \uB0A9\uBD80 \uC77C\uC815\uC744 \uD55C \uD654\uBA74\uC5D0\uC11C \uD655\uC778\uD558\uACE0, \uBBF8\uB0A9 \uD68C\uCC28\uB97C \uBC14\uB85C \uB0A9\uBD80 \uCC98\uB9AC\uD569\uB2C8\uB2E4.",
  overdueCount: "\uC5F0\uCCB4",
  reminders: "\uBD84\uD560 \uC54C\uB9BC \uAD00\uB9AC",
  calendar: "\uB2EC\uB825 \uBCF4\uAE30",
  breadcrumbPayments: "\uC218\uB0A9 \uAD00\uB9AC",
  breadcrumbCurrent: "\uBD84\uD560 \uAD00\uB9AC",
  processingTitle: "\uB0A9\uBD80 \uCC98\uB9AC",
  processingDescription: "\uAC1C\uBCC4 \uBD84\uD560 \uD68C\uCC28\uC758 \uB0A9\uBD80 \uC0C1\uD0DC\uB97C \uD655\uC778\uD558\uACE0 \uC624\uB298 \uAE30\uC900\uC73C\uB85C \uCC98\uB9AC\uD569\uB2C8\uB2E4.",
  backToPayments: "\u2190 \uC218\uB0A9 \uB0B4\uC5ED\uC73C\uB85C",
} as const;

function courseNameOf(item: {
  cohort?: { name: string } | null;
  product?: { name: string } | null;
  specialLecture?: { name: string } | null;
}) {
  return item.cohort?.name ?? item.product?.name ?? item.specialLecture?.name ?? "\uAC15\uC88C \uBBF8\uC9C0\uC815";
}

function toEnrollmentSummary(
  enrollments: Array<{
    id: string;
    status: string;
    cohort: { name: string } | null;
    product: { name: string } | null;
    specialLecture: { name: string } | null;
  }>,
): InstallmentEnrollmentSummary[] {
  return enrollments.map((enrollment) => ({
    id: enrollment.id,
    label: courseNameOf(enrollment),
    status: enrollment.status,
  }));
}

export default async function InstallmentsPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekLater = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const allInstallments = await prisma.installment.findMany({
    include: {
      payment: {
        select: {
          id: true,
          examNumber: true,
          enrollmentId: true,
          student: { select: { name: true } },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { seq: "asc" }],
    take: 500,
  });

  const enrollmentIds = [
    ...new Set(
      allInstallments.map((installment) => installment.payment.enrollmentId).filter((id): id is string => id !== null),
    ),
  ];

  const enrollments = await prisma.courseEnrollment.findMany({
    where: { id: { in: enrollmentIds } },
    select: {
      id: true,
      cohort: { select: { name: true } },
    },
  });

  const enrollmentMap: Record<string, string | null> = {};
  for (const enrollment of enrollments) {
    enrollmentMap[enrollment.id] = enrollment.cohort?.name ?? null;
  }

  const dashboardRows: InstallmentDashboardRow[] = allInstallments.map((item) => {
    const isOverdue = item.paidAt === null && item.dueDate < todayStart;
    const daysOverdue = isOverdue
      ? Math.floor((todayStart.getTime() - item.dueDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      id: item.id,
      paymentId: item.paymentId,
      seq: item.seq,
      amount: item.amount,
      dueDate: item.dueDate.toISOString(),
      paidAt: item.paidAt?.toISOString() ?? null,
      examNumber: item.payment.examNumber ?? null,
      studentName: item.payment.student?.name ?? null,
      cohortName: item.payment.enrollmentId ? (enrollmentMap[item.payment.enrollmentId] ?? null) : null,
      daysOverdue,
    };
  });

  const unpaidRows = dashboardRows.filter((row) => row.paidAt === null);
  const overdueRows = dashboardRows.filter((row) => row.paidAt === null && new Date(row.dueDate) < todayStart);
  const upcomingRows = dashboardRows.filter(
    (row) => row.paidAt === null && new Date(row.dueDate) >= todayStart && new Date(row.dueDate) <= weekLater,
  );
  const paidRows = dashboardRows.filter((row) => row.paidAt !== null);

  const stats: InstallmentDashboardStats = {
    totalOutstanding: unpaidRows.reduce((sum, row) => sum + row.amount, 0),
    overdueCount: overdueRows.length,
    upcomingWeekCount: upcomingRows.length,
    collectionRate: dashboardRows.length > 0 ? (paidRows.length / dashboardRows.length) * 100 : 0,
  };

  const initialItems = await prisma.installment.findMany({
    where: { paidAt: null, dueDate: { lt: todayStart } },
    include: {
      payment: {
        select: {
          id: true,
          examNumber: true,
          category: true,
          netAmount: true,
          note: true,
          student: {
            select: {
              name: true,
              phone: true,
              courseEnrollments: {
                orderBy: [{ createdAt: "desc" }],
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
          items: { select: { itemName: true }, take: 1 },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { seq: "asc" }],
    take: 100,
  });

  const [overdueCount, upcomingCount, paidCount] = await Promise.all([
    prisma.installment.count({ where: { paidAt: null, dueDate: { lt: todayStart } } }),
    prisma.installment.count({ where: { paidAt: null, dueDate: { gte: todayStart } } }),
    prisma.installment.count({ where: { paidAt: { not: null } } }),
  ]);

  const serialized: InstallmentItem[] = initialItems.map((item) => ({
    id: item.id,
    paymentId: item.paymentId,
    seq: item.seq,
    amount: item.amount,
    dueDate: item.dueDate.toISOString(),
    paidAt: item.paidAt?.toISOString() ?? null,
    paidPaymentId: item.paidPaymentId,
    payment: {
      id: item.payment.id,
      examNumber: item.payment.examNumber,
      category: item.payment.category,
      netAmount: item.payment.netAmount,
      note: item.payment.note,
      student: item.payment.student
        ? {
            name: item.payment.student.name,
            phone: item.payment.student.phone,
            enrollments: toEnrollmentSummary(item.payment.student.courseEnrollments),
          }
        : null,
      firstItemName: item.payment.items[0]?.itemName ?? null,
    },
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        {TEXT.badge}
      </div>

      <div className="mt-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">{TEXT.title}</h1>
          <p className="mt-1 text-sm text-slate">{TEXT.description}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {overdueCount > 0 ? (
            <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
              {TEXT.overdueCount} {overdueCount.toLocaleString()}건
            </span>
          ) : null}
          <Link
            href="/admin/payments/installments/reminders"
            className="inline-flex items-center gap-2 rounded-full border border-forest/30 bg-forest/5 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/10"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            {TEXT.reminders}
          </Link>
          <Link
            href="/admin/payments/installments/calendar"
            className="inline-flex items-center gap-2 rounded-full border border-ember/30 bg-ember/5 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {TEXT.calendar}
          </Link>
        </div>
      </div>

      <nav className="mt-4 flex items-center gap-1.5 text-xs text-slate">
        <Link href="/admin/payments" className="hover:text-ember hover:underline">
          {TEXT.breadcrumbPayments}
        </Link>
        <span>/</span>
        <span className="font-medium text-ink">{TEXT.breadcrumbCurrent}</span>
      </nav>

      <div className="mt-8">
        <InstallmentClient rows={dashboardRows} stats={stats} />
      </div>

      <div className="mt-12 border-t border-ink/10 pt-8">
        <h2 className="text-xl font-semibold text-ink">{TEXT.processingTitle}</h2>
        <p className="mt-1 text-sm text-slate">{TEXT.processingDescription}</p>
      </div>

      <div className="mt-6">
        <InstallmentManager
          initialItems={serialized}
          initialStatus="overdue"
          summary={{ overdueCount, upcomingCount, paidCount }}
        />
      </div>

      <div className="mt-6">
        <Link
          href="/admin/payments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          {TEXT.backToPayments}
        </Link>
      </div>
    </div>
  );
}
