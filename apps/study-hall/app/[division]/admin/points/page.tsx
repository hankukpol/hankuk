import { PointGrantManager } from "@/components/points/PointGrantManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { listPointRecords, listPointRules } from "@/lib/services/point.service";
import { listStudents } from "@/lib/services/student.service";

type AdminPointsPageProps = {
  params: {
    division: string;
  };
};

export default async function AdminPointsPage({ params }: AdminPointsPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "pointManagement");

  const [students, rules, records] = await Promise.all([
    listStudents(params.division),
    listPointRules(params.division),
    listPointRecords(params.division, { limit: 12 }),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white px-6 py-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">상벌점 관리</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          학생별 개별 부여와 다수 학생 대상 일괄 부여를 모두 지원합니다. 최근 기록은 바로 확인하고
          취소할 수 있습니다.
        </p>
      </section>

      <PointGrantManager
        divisionSlug={params.division}
        students={students}
        rules={rules}
        initialRecords={records}
      />
    </div>
  );
}
