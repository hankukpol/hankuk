import dynamic from "next/dynamic";

import { ClipboardList, Smartphone } from "lucide-react";

import { PhoneCheckForm } from "@/components/phones/PhoneCheckForm";
import { redirectIfDivisionFeatureDisabled } from "@/lib/division-feature-guard";
import { getPhoneDaySnapshot } from "@/lib/services/phone-submission.service";
import { getSeatLayout, listStudyRooms } from "@/lib/services/seat.service";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";

const PhoneSubmissionManager = dynamic(
  () =>
    import("@/components/phones/PhoneSubmissionManager").then((mod) => mod.PhoneSubmissionManager),
  {
    loading: () => (
      <div className="rounded-[10px] border border-dashed border-slate-300 px-4 py-16 text-center text-sm text-slate-500">
        휴대폰 이력 데이터를 불러오는 중입니다.
      </div>
    ),
  },
);

function getKstToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type PhoneSubmissionsPageProps = {
  params: {
    division: string;
  };
};

export default async function PhoneSubmissionsPage({ params }: PhoneSubmissionsPageProps) {
  await redirectIfDivisionFeatureDisabled(params.division, "phoneSubmissions");
  const today = getKstToday();

  const [snapshot, seatRooms, initialSeatLayout, featureSettings] = await Promise.all([
    getPhoneDaySnapshot(params.division, today),
    listStudyRooms(params.division),
    getSeatLayout(params.division),
    getDivisionFeatureSettings(params.division),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-[10px] border border-black/5 bg-white p-6 shadow-[0_18px_50px_rgba(18,32,56,0.08)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          휴대폰 관리
        </p>
        <h1 className="mt-3 text-3xl font-extrabold text-slate-950">휴대폰 관리</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          교시별 휴대폰 반납, 미반납, 대여 상태를 체크하고 필요한 경우 미반납 학생에게
          벌점을 부여할 수 있습니다.
        </p>
      </section>

      <section className="rounded-[10px] border border-black/5 bg-white p-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-100 text-slate-600">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              오늘 체크
            </p>
            <h2 className="text-xl font-bold text-slate-950">오늘 체크</h2>
          </div>
        </div>
        <PhoneCheckForm
          divisionSlug={params.division}
          initialDate={today}
          initialSnapshot={snapshot}
          seatRooms={seatRooms}
          initialSeatLayout={initialSeatLayout}
        />
      </section>

      <section className="rounded-[10px] border border-black/5 bg-white p-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-100 text-slate-600">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              이력 조회
            </p>
            <h2 className="text-xl font-bold text-slate-950">이력 조회</h2>
          </div>
        </div>
        <PhoneSubmissionManager
          divisionSlug={params.division}
          pointsEnabled={featureSettings.featureFlags.pointManagement}
        />
      </section>
    </div>
  );
}
