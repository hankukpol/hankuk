import { AdminRole } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { requireAdminContext, roleAtLeast } from "@/lib/auth";
import { applyAcademyScope, getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";
import { PaymentDetail, type PaymentDetailData } from "./payment-detail";
import { buildScopedEnrollmentListWhere, buildScopedPaymentWhere } from "./payment-scope";

export const dynamic = "force-dynamic";

function courseNameOf(item: {
  cohort?: { name: string } | null;
  product?: { name: string } | null;
  specialLecture?: { name: string } | null;
}) {
  return (
    item.cohort?.name ??
    item.product?.name ??
    item.specialLecture?.name ??
    "\uACFC\uC815 \uBBF8\uC9C0\uC815"
  );
}

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireAdminContext(AdminRole.COUNSELOR);
  const { id } = await params;
  const academyScope = await getAdminAcademyScope();
  const academyId = resolveVisibleAcademyId(academyScope);
  const prisma = getPrisma();

  const payment =
    academyId === null
      ? await prisma.payment.findUnique({
          where: { id },
          select: {
            id: true,
            examNumber: true,
            enrollmentId: true,
            category: true,
            method: true,
            status: true,
            grossAmount: true,
            discountAmount: true,
            couponAmount: true,
            pointAmount: true,
            netAmount: true,
            note: true,
            cashReceiptNo: true,
            cashReceiptType: true,
            cashReceiptIssuedAt: true,
            processedAt: true,
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
            processor: { select: { name: true } },
            items: { orderBy: { id: "asc" } },
            refunds: {
              orderBy: { processedAt: "desc" },
              select: {
                id: true,
                refundType: true,
                status: true,
                amount: true,
                reason: true,
                rejectionReason: true,
                bankName: true,
                accountNo: true,
                accountHolder: true,
                processedAt: true,
              },
            },
            installments: {
              orderBy: { seq: "asc" },
            },
          },
        })
      : await prisma.payment.findFirst({
          where: buildScopedPaymentWhere(id, academyId),
          select: {
            id: true,
            examNumber: true,
            enrollmentId: true,
            category: true,
            method: true,
            status: true,
            grossAmount: true,
            discountAmount: true,
            couponAmount: true,
            pointAmount: true,
            netAmount: true,
            note: true,
            cashReceiptNo: true,
            cashReceiptType: true,
            cashReceiptIssuedAt: true,
            processedAt: true,
            student: {
              select: {
                name: true,
                phone: true,
                courseEnrollments: {
                  where: buildScopedEnrollmentListWhere(academyId),
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
            processor: { select: { name: true } },
            items: { orderBy: { id: "asc" } },
            refunds: {
              orderBy: { processedAt: "desc" },
              select: {
                id: true,
                refundType: true,
                status: true,
                amount: true,
                reason: true,
                rejectionReason: true,
                bankName: true,
                accountNo: true,
                accountHolder: true,
                processedAt: true,
              },
            },
            installments: {
              orderBy: { seq: "asc" },
            },
          },
        });

  if (!payment) {
    const enrollment = await prisma.courseEnrollment.findFirst({
      where: applyAcademyScope({ id }, academyId),
      select: { id: true },
    });

    if (enrollment) {
      redirect(`/admin/payments/new?enrollmentId=${enrollment.id}`);
    }

    notFound();
  }

  const paymentData: PaymentDetailData = {
    ...payment,
    processedAt: payment.processedAt.toISOString(),
    cashReceiptIssuedAt: payment.cashReceiptIssuedAt?.toISOString() ?? null,
    student: payment.student
      ? {
          name: payment.student.name,
          phone: payment.student.phone,
          enrollments: payment.student.courseEnrollments.map((enrollment) => ({
            id: enrollment.id,
            label: courseNameOf(enrollment),
            status: enrollment.status,
          })),
        }
      : null,
    refunds: payment.refunds.map((refund) => ({
      ...refund,
      processedAt: refund.processedAt.toISOString(),
    })),
    installments: payment.installments.map((installment) => ({
      ...installment,
      dueDate: installment.dueDate.toISOString(),
      paidAt: installment.paidAt?.toISOString() ?? null,
    })),
  };

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "\uACB0\uC81C \uAD00\uB9AC", href: "/admin/payments" },
          { label: "\uACB0\uC81C \uC774\uB825", href: "/admin/payments" },
          { label: `#${id.slice(-6)}` },
        ]}
      />

      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        {"\uACB0\uC81C \uC0C1\uC138"}
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">
            {payment.student ? payment.student.name : "\uBE44\uD68C\uC6D0"}
            <span className="ml-3 text-xl font-normal text-slate">
              {`${payment.netAmount.toLocaleString()}\uC6D0`}
            </span>
          </h1>
          {payment.examNumber ? (
            <p className="mt-1 text-sm text-slate">
              {"\uD559\uBC88"}: {payment.examNumber}
            </p>
          ) : null}
        </div>
        <a
          href="/admin/payments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          {"\uACB0\uC81C \uBAA9\uB85D\uC73C\uB85C"}
        </a>
      </div>

      <div className="mt-8">
        <PaymentDetail
          payment={paymentData}
          canManageInstallments={roleAtLeast(context.adminUser.role, AdminRole.MANAGER)}
        />
      </div>
    </div>
  );
}
