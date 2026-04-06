import { AdminStudyRankingManager } from "@/components/study-time/AdminStudyRankingManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { getKstMonth } from "@/lib/study-time-meta";
import { getDivisionStudyTimeRanking } from "@/lib/services/study-time.service";

type AdminStudyRankingPageProps = {
  params: {
    division: string;
  };
};

export default async function AdminStudyRankingPage({
  params,
}: AdminStudyRankingPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "studentManagement");

  const initialRanking = await getDivisionStudyTimeRanking(
    params.division,
    getKstMonth(),
  );

  return (
    <div className="space-y-6">
      <section className="rounded-[10px] border border-slate-200/60 bg-white px-6 py-6 shadow-[0_18px_48px_rgba(18,32,56,0.07)]">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">
          월간 학습시간 랭킹
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          달력에서 조회 월을 선택하면 학생별 해당 월 누적 학습시간과 랭킹을 1등부터
          순서대로 확인할 수 있습니다.
        </p>
      </section>

      <AdminStudyRankingManager
        divisionSlug={params.division}
        initialRanking={initialRanking}
      />
    </div>
  );
}
