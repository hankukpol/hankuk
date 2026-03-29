import { notFound } from "next/navigation";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { buildScopedPaymentWhere, getVisiblePaymentAcademyId } from "../payment-scope";
import { PaymentEditForm } from "./payment-edit-form";

export const dynamic = "force-dynamic";

export default async function PaymentEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminContext(AdminRole.MANAGER);

  const { id } = await params;
  const academyId = await getVisiblePaymentAcademyId();
  const prisma = getPrisma();

  const payment =
    academyId === null
      ? await prisma.payment.findUnique({
          where: { id },
          select: {
            id: true,
            category: true,
            status: true,
            grossAmount: true,
            discountAmount: true,
            couponAmount: true,
            pointAmount: true,
            netAmount: true,
            note: true,
            processedAt: true,
            examNumber: true,
            student: { select: { name: true } },
          },
        })
      : await prisma.payment.findFirst({
          where: buildScopedPaymentWhere(id, academyId),
          select: {
            id: true,
            category: true,
            status: true,
            grossAmount: true,
            discountAmount: true,
            couponAmount: true,
            pointAmount: true,
            netAmount: true,
            note: true,
            processedAt: true,
            examNumber: true,
            student: { select: { name: true } },
          },
        });

  if (!payment) notFound();

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "수납 관리", href: "/admin/payments" },
          { label: "수납 상세", href: `/admin/payments/${id}` },
          { label: "수정" },
        ]}
      />
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>
      <div className="mt-4">
        <h1 className="text-3xl font-semibold">수납 정보 수정</h1>
        {payment.student ? (
          <p className="mt-1 text-sm text-slate">
            {payment.student.name}
            {payment.examNumber ? ` (${payment.examNumber})` : ""}
            {" · "}#{id.slice(-6)}
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate">비회원 · #{id.slice(-6)}</p>
        )}
      </div>
      <div className="mt-8 max-w-xl">
        <PaymentEditForm
          paymentId={id}
          initialCategory={payment.category}
          initialStatus={payment.status}
          initialGrossAmount={payment.grossAmount}
          initialNote={payment.note ?? ""}
          initialProcessedAt={payment.processedAt.toISOString().slice(0, 16)}
          isPending={payment.status === "PENDING"}
        />
      </div>
    </div>
  );
}
