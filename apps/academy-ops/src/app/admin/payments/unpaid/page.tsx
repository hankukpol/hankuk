import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { UnpaidListClient, type UnpaidInstallmentRow } from "./unpaid-list-client";

export const dynamic = "force-dynamic";

type EnrollmentSummary = {
  id: string;
  courseType: string;
  status: string;
  label: string;
};

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}

function formatKRW(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}\uC6D0`;
}

function buildEnrollmentLabel(enrollment: {
  courseType: string;
  status: string;
  cohort: { name: string | null } | null;
  product: { name: string } | null;
  specialLecture: { name: string | null } | null;
}): string {
  const base =
    enrollment.cohort?.name ??
    enrollment.product?.name ??
    enrollment.specialLecture?.name ??
    (enrollment.courseType === "SPECIAL_LECTURE" ? "\uD2B9\uAC15" : "\uC885\uD569\uBC18");

  if (enrollment.status === "CANCELLED") {
    return `${base} \u00B7 \uCDE8\uC18C`;
  }

  return base;
}

function summarizeEnrollments(enrollments: EnrollmentSummary[]): string[] {
  if (enrollments.length === 0) return [];
  const labels = enrollments
    .slice(0, 2)
    .map((enrollment) => enrollment.label)
    .filter(Boolean);
  if (enrollments.length > 2) {
    labels.push(`\uC678 ${enrollments.length - 2}\uAC74`);
  }
  return labels;
}

export default async function UnpaidPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  const prisma = getPrisma();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const weekLater = new Date(todayStart);
  weekLater.setDate(weekLater.getDate() + 7);

  const rawItems = await prisma.installment.findMany({
    where: { paidAt: null },
    include: {
      payment: {
        select: {
          id: true,
          enrollmentId: true,
          examNumber: true,
          category: true,
          netAmount: true,
          note: true,
          student: {
            select: {
              name: true,
              phone: true,
              examNumber: true,
              courseEnrollments: {
                select: {
                  id: true,
                  courseType: true,
                  status: true,
                  cohort: { select: { name: true } },
                  product: { select: { name: true } },
                  specialLecture: { select: { name: true } },
                },
                orderBy: [{ createdAt: "asc" }],
              },
            },
          },
          items: { select: { itemName: true }, take: 1 },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { seq: "asc" }],
    take: 500,
  });

  const paymentIds = [...new Set(rawItems.map((item) => item.paymentId))];
  const allInstallments = await prisma.installment.findMany({
    where: { paymentId: { in: paymentIds } },
    select: { paymentId: true, seq: true },
  });

  const totalRoundsMap = new Map<string, number>();
  for (const installment of allInstallments) {
    const current = totalRoundsMap.get(installment.paymentId) ?? 0;
    if (installment.seq > current) totalRoundsMap.set(installment.paymentId, installment.seq);
  }

  const rows: UnpaidInstallmentRow[] = rawItems.map((item) => {
    const dueDate = item.dueDate;
    const isOverdue = dueDate < todayStart;
    const isThisWeek = dueDate >= todayStart && dueDate < weekLater;
    const installmentStatus: UnpaidInstallmentRow["installmentStatus"] = isOverdue
      ? "OVERDUE"
      : "PENDING";

    const enrollments = item.payment.student?.courseEnrollments ?? [];
    const enrollmentSummaries: EnrollmentSummary[] = enrollments.map((enrollment) => ({
      id: enrollment.id,
      courseType: enrollment.courseType,
      status: enrollment.status,
      label: buildEnrollmentLabel(enrollment),
    }));

    return {
      id: item.id,
      paymentId: item.paymentId,
      enrollmentId: item.payment.enrollmentId ?? null,
      examNumber: item.payment.examNumber ?? null,
      studentName: item.payment.student?.name ?? null,
      mobile: item.payment.student?.phone ?? null,
      courseName: item.payment.items[0]?.itemName ?? item.payment.note ?? "\uAC00\uC785 \uB0B4\uC5ED",
      enrollments: summarizeEnrollments(enrollmentSummaries),
      seq: item.seq,
      totalRounds: totalRoundsMap.get(item.paymentId) ?? item.seq,
      dueDate: formatDate(dueDate),
      amount: item.amount,
      installmentStatus,
      isThisWeek,
    };
  });

  const totalCount = rows.length;
  const pendingCount = rows.filter((row) => row.installmentStatus === "PENDING").length;
  const overdueCount = rows.filter((row) => row.installmentStatus === "OVERDUE").length;
  const thisWeekCount = rows.filter((row) => row.isThisWeek).length;
  const totalUnpaidAmount = rows.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        \uBBF8\uB0A9 \uAD00\uB9AC
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">\uBBF8\uB0A9 \uD604\uD669</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate">
            \uBBF8\uB0A9 \uC218\uB0A9 \uD56D\uBAA9\uC744 \uC870\uD68C\uD558\uACE0 \uC624\uB298 \uAE30\uC900
            \uBBF8\uB0A9\u00B7\uBD84\uD560 \uB0A9\uBD80 \uAC74\uC744 \uBE60\uB974\uAC8C \uC548\uB0B4\uD569\uB2C8\uB2E4.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/payments/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-ember/90"
          >
            + \uC218\uB0A9 \uB4F1\uB85D
          </Link>
          <Link
            href="/admin/payments/installments"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
          >
            \uBD84\uD560 \uAD00\uB9AC
          </Link>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">
            \uC804\uCCB4 \uBBF8\uB0A9
          </p>
          <p className="mt-2 text-3xl font-semibold text-ink">{totalCount.toLocaleString()}</p>
          <p className="mt-1 text-xs text-slate">\uAC74</p>
        </div>

        <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-amber-700">
            \uBBF8\uB0A9(\uC608\uC815)
          </p>
          <p className="mt-2 text-3xl font-semibold text-amber-700">
            {pendingCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-amber-600">\uAC74</p>
        </div>

        <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-red-600">\uC5F0\uCC28</p>
          <p className="mt-2 text-3xl font-semibold text-red-700">{overdueCount.toLocaleString()}</p>
          <p className="mt-1 text-xs text-red-500">\uAC74</p>
        </div>

        <div className="rounded-[28px] border border-ember/20 bg-ember/5 p-6 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-ember">
            \uCD1D \uBBF8\uB0A9\uC561
          </p>
          <p className="mt-2 text-2xl font-semibold text-ember">{formatKRW(totalUnpaidAmount)}</p>
          <p className="mt-1 text-xs text-ember/70">\uC774\uBC88 \uBAA9\uB85D \uD569\uACC4</p>
        </div>
      </div>

      <div className="mt-8">
        <UnpaidListClient
          rows={rows}
          summary={{
            totalCount,
            pendingCount,
            overdueCount,
            thisWeekCount,
            totalUnpaidAmount,
          }}
        />
      </div>

      <p className="mt-4 text-xs text-slate/70">
        * \uCD5C\uB300 500\uAC74\uC758 \uBBF8\uB0A9 \uBD84\uD560 \uB0A9\uBD80\uB97C \uD45C\uC2DC\uD569\uB2C8\uB2E4. \uC2E4\uC81C \uC815\uB82C\uC740 \uB0A9\uBD80 \uAE30\uD55C \uC624\uB984\uCC28\uC21C\uC785\uB2C8\uB2E4.
      </p>
    </div>
  );
}
