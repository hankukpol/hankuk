import { PointGrantManager } from "@/components/points/PointGrantManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { getKstCurrentMonthRange } from "@/lib/point-date-range";
import { listPointRecords, listPointRules } from "@/lib/services/point.service";
import { listStudents } from "@/lib/services/student.service";

type AdminPointsPageProps = {
  params: {
    division: string;
  };
};

export default async function AdminPointsPage({ params }: AdminPointsPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "pointManagement");

  const initialRange = getKstCurrentMonthRange();
  const [students, rules, records] = await Promise.all([
    listStudents(params.division, {
      pointDateFrom: initialRange.dateFrom,
      pointDateTo: initialRange.dateTo,
    }),
    listPointRules(params.division),
    listPointRecords(params.division, {
      dateFrom: initialRange.dateFrom,
      dateTo: initialRange.dateTo,
      limit: 50,
    }),
  ]);

  return (
    <div className="admin-flat-page">
      <section>
        <h1 className="admin-page-title">상벌점 관리</h1>
      </section>

      <PointGrantManager
        divisionSlug={params.division}
        students={students}
        rules={rules}
        initialRecords={records}
        initialDateFrom={initialRange.dateFrom}
        initialDateTo={initialRange.dateTo}
      />
    </div>
  );
}
