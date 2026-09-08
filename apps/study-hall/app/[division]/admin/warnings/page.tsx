import { getPolicyReviewSignals } from "@/lib/services/policy-review.service";
import { listStudents } from "@/lib/services/student.service";
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

  const signals = await getPolicyReviewSignals(params.division);
  const signalStudents = signals.length ? await listStudents(params.division) : [];
  const names = new Map(signalStudents.map((s) => [s.id, `${s.name} (${s.studentNumber})`]));

  return (
    <div className="admin-flat-page">
      <section>
        <h1 className="admin-page-title">경고 대상자 관리</h1>
        <p className="admin-page-description">
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
      {signals.length > 0 && <section className="admin-section"><h2 className="admin-section-title">반복 위반·예외 검토</h2><p className="admin-help">확정된 벌점과 반출 기록을 기준으로 표시합니다. 인정사유와 기록 오류를 확인한 뒤 면담 기록에 판단과 조치를 남겨 주세요.</p><ul className="space-y-4">{signals.map((s, i) => <li key={`${s.studentId}:${i}`}>{names.get(s.studentId) ?? "학생 확인 필요"} · {s.reason} → {s.action}</li>)}</ul></section>}
    </div>
  );
}
