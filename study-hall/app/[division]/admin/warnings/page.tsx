import { WarningStudentsManager } from "@/components/points/WarningStudentsManager";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { listWarningStudents } from "@/lib/services/point.service";
import {
  getDivisionFeatureSettings,
  getDivisionRuleSettings,
  getDivisionTheme,
} from "@/lib/services/settings.service";

type WarningPageProps = {
  params: {
    division: string;
  };
};

export default async function WarningPage({ params }: WarningPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "warningManagement");
  const [students, settings, division, featureSettings] = await Promise.all([
    listWarningStudents(params.division),
    getDivisionRuleSettings(params.division),
    getDivisionTheme(params.division),
    getDivisionFeatureSettings(params.division),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white px-6 py-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">경고 대상자 관리</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          직렬 설정의 경고 임계값을 기준으로 대상자를 자동 분류하고 연락처를 바로 복사할 수 있습니다.
        </p>
      </section>

      <WarningStudentsManager
        divisionSlug={params.division}
        initialStudents={students}
        divisionName={division.fullName}
        warningTemplates={{
          WARNING_1: settings.warnMsgLevel1,
          WARNING_2: settings.warnMsgLevel2,
          INTERVIEW: settings.warnMsgInterview,
          WITHDRAWAL: settings.warnMsgWithdraw,
        }}
        studentManagementEnabled={featureSettings.featureFlags.studentManagement}
      />
    </div>
  );
}
