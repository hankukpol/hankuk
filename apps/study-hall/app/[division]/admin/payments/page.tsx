import { PaymentManager } from "@/components/payments/PaymentManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { listPaymentCategories, listPayments } from "@/lib/services/payment.service";
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
    <div className="admin-flat-page">
      <section>
        <h1 className="admin-page-title">수납 관리</h1>
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
