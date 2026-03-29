import { PeriodSettingsManager } from "@/components/periods/PeriodSettingsManager";
import { getPeriods } from "@/lib/services/period.service";

type PeriodSettingsPageProps = {
  params: {
    division: string;
  };
};


export default async function PeriodSettingsPage({ params }: PeriodSettingsPageProps) {
  const periods = await getPeriods(params.division);

  return (
    <div className="space-y-6">
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(18,32,56,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          설정 / 교시
        </p>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-950">교시 설정</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
          교시명, 시간, 필수 여부, 활성 상태를 직렬별로 관리합니다. 이후 조교 출석체크와
          관리자 출석부는 이 설정을 기준으로 동작합니다.
        </p>
      </section>

      <PeriodSettingsManager divisionSlug={params.division} initialPeriods={periods} />
    </div>
  );
}
