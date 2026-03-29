import { PaymentManager } from "@/components/payments/PaymentManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import {
  listPaymentCategories,
  listPayments,
} from "@/lib/services/payment.service";
import { listStudents } from "@/lib/services/student.service";
import { listTuitionPlans } from "@/lib/services/tuition-plan.service";

type AdminPaymentsPageProps = {
  params: {
    division: string;
  };
};


export default async function AdminPaymentsPage({ params }: AdminPaymentsPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "paymentManagement");

  const [students, paymentCategories, payments, tuitionPlans] = await Promise.all([
    listStudents(params.division),
    listPaymentCategories(params.division, { activeOnly: true }),
    listPayments(params.division),
    listTuitionPlans(params.division, { activeOnly: true }),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white px-6 py-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">수납 관리</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          학생별 수납 내역을 기록하고, 수납 유형과 기준 월에 따라 완납/미납 현황을 확인합니다.
        </p>
      </section>

      <PaymentManager
        divisionSlug={params.division}
        students={students}
        paymentCategories={paymentCategories}
        initialPayments={payments}
        tuitionPlans={tuitionPlans}
      />
    </div>
  );
}
