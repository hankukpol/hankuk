import { PointRuleManager } from "@/components/points/PointRuleManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";

type PointRulePageProps = {
  params: {
    division: string;
  };
};

export default async function PointRulePage({ params }: PointRulePageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "pointManagement");

  return (
    <div className="admin-flat-page">
      <section>
        <h1 className="admin-page-title">상벌점 규칙 설정</h1>
        <p className="admin-page-description">
          직렬별 상벌점 규칙을 추가, 수정, 비활성화할 수 있습니다. 경고 단계 기준은 별도 설정값을 따릅니다.
        </p>
      </section>

      <PointRuleManager divisionSlug={params.division} />
    </div>
  );
}
