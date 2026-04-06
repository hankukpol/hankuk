import { RulesSettingsManager } from "@/components/settings/RulesSettingsManager";
import { listPointRules } from "@/lib/services/point.service";
import { getDivisionRuleSettings } from "@/lib/services/settings.service";

type RulesSettingsPageProps = {
  params: {
    division: string;
  };
};


export default async function RulesSettingsPage({ params }: RulesSettingsPageProps) {
  const [settings, pointRules] = await Promise.all([
    getDivisionRuleSettings(params.division),
    listPointRules(params.division, { activeOnly: true }),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(18,32,56,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          설정 / 운영 규칙
        </p>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-950">운영 규칙 설정</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          지각 기준, 조교 출석 수정 범위, 경고 임계값, 휴가 한도, 경고 문자 템플릿을 지점별로 관리합니다.
          이 값은 출석 처리와 경고 대상 산정, 문자 초안 생성에 즉시 사용됩니다.
        </p>
      </section>

      <RulesSettingsManager
        divisionSlug={params.division}
        initialSettings={settings}
        pointRules={pointRules}
      />
    </div>
  );
}
