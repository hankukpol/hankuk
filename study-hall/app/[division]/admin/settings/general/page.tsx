import { GeneralSettingsManager } from "@/components/settings/GeneralSettingsManager";
import { getDivisionGeneralSettings } from "@/lib/services/settings.service";

type GeneralSettingsPageProps = {
  params: {
    division: string;
  };
};


export default async function GeneralSettingsPage({
  params,
}: GeneralSettingsPageProps) {
  const settings = await getDivisionGeneralSettings(params.division);

  return (
    <div className="space-y-6">
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(18,32,56,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          설정 / 일반
        </p>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-950">지점 기본 정보</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          지점 이름, 학원 전체 이름, 브랜드 색상, 운영 요일, 직렬 목록을 설정합니다.
          올패스독학원과 한경스파르타처럼 여러 직렬이 공존하는 지점도 여기서 개별 운영 기준을
          직접 세팅할 수 있습니다.
        </p>
      </section>

      <GeneralSettingsManager divisionSlug={params.division} initialSettings={settings} />
    </div>
  );
}
