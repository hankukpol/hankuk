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
    <div className="space-y-6">
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white px-6 py-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">상벌점 규칙 설정</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          직렬별 상벌점 규칙을 추가, 수정, 비활성화할 수 있습니다. 경고 단계 기준은 별도 설정값을 따릅니다.
        </p>
      </section>

      <PointRuleManager divisionSlug={params.division} />
    </div>
  );
}
