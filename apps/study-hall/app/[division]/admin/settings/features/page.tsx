import { FeatureSettingsManager } from "@/components/settings/FeatureSettingsManager";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";

type FeatureSettingsPageProps = {
  params: {
    division: string;
  };
};

export default async function FeatureSettingsPage({
  params,
}: FeatureSettingsPageProps) {
  const settings = await getDivisionFeatureSettings(params.division);

  return (
    <div className="space-y-6">
      <section className="rounded-[10px] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(18,32,56,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          설정 / 기능
        </p>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-950">지점 기능 설정</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          공지, 휴대폰 관리, 상벌점, 수납, 면담, 좌석, 시험 관련 기능을 지점 단위로 켜고 끌 수 있습니다.
          비활성 기능은 관리자 메뉴와 주요 진입 화면에서 함께 정리됩니다.
        </p>
      </section>

      <FeatureSettingsManager divisionSlug={params.division} initialSettings={settings} />
    </div>
  );
}
