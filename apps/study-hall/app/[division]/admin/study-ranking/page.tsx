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
    <div className="admin-flat-page">
      <section>
        <h1 className="admin-page-title">
          월간 학습시간 랭킹
        </h1>
        <p className="admin-page-description">
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
