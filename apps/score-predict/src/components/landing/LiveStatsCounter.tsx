import type { ReactNode } from "react";
import { Clock3, ShieldCheck, Users } from "lucide-react";

export interface LandingLiveStats {
  examName: string;
  examYear: number;
  examRound: number;
  examDate: Date;
  latestReleaseNumber: number | null;
  latestReleasedAt: Date | null;
  totalParticipants: number;
  publicParticipants: number;
  careerParticipants?: number;
  careerRescueParticipants?: number;
  careerAcademicParticipants?: number;
  careerEmtParticipants?: number;
  recentParticipants: number;
  updatedAt: Date | null;
}

interface LiveStatsCounterProps {
  stats: LandingLiveStats | null;
  careerExamEnabled?: boolean;
}

function formatDateTime(date: Date | null): string {
  if (!date) {
    return "집계 데이터 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function StatCard({
  label,
  value,
  icon,
  valueClass,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  valueClass: string;
}) {
  return (
    <article className="min-w-0 bg-slate-50 px-3 py-3.5 sm:px-5 sm:py-4">
      <div className="flex items-center justify-between gap-1">
        <p className="truncate text-xs font-semibold text-slate-500">{label}</p>
        {icon}
      </div>
      <p className={`mt-2 font-black text-slate-900 ${valueClass}`}>
        {value.toLocaleString("ko-KR")}명
      </p>
    </article>
  );
}

export default function LiveStatsCounter({
  stats,
  careerExamEnabled = true,
}: LiveStatsCounterProps) {
  if (!stats) {
    return (
      <section className="border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900">
        현재 집계 가능한 활성 시험이 없습니다. 관리자 페이지에서 시험 활성 상태를 확인해 주세요.
      </section>
    );
  }

  const hasCombinedCareerStats = typeof stats.careerParticipants === "number";
  // 참여 수치는 라벨도 값도 짧다. 모바일에서 한 장씩 세로로 쌓지 않고
  // 카드 수에 맞춰 2~3열로 묶어 한 화면에서 비교되게 한다.
  const isThreeUpOnMobile = !careerExamEnabled;
  const gridClass = careerExamEnabled
    ? hasCombinedCareerStats
      ? "grid-cols-2 xl:grid-cols-4"
      : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
    : "grid-cols-3";
  // 360px 3열은 카드 안쪽이 84px뿐이라 20px 숫자는 "12,345명"에서 줄이 바뀐다.
  // 18px면 77px로 다섯 자리까지 한 줄에 들어간다. 2열은 여유가 있어 20px를 쓴다.
  const valueClass = isThreeUpOnMobile ? "text-lg sm:text-2xl" : "text-xl sm:text-2xl";

  return (
    <section className="relative overflow-hidden border-t border-slate-200 pt-6 sm:pb-8 sm:pt-8">
      <div className="relative">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="user-section-title">합격예측 실시간 참여 현황</h2>
            <p className="mt-1 text-sm font-semibold text-service-600">
              {stats.examYear}년 {stats.examRound}차 · {stats.examName}
            </p>
          </div>
          <p className="text-xs font-semibold text-slate-400">
            최근 갱신: {formatDateTime(stats.updatedAt)}
          </p>
        </div>

        <div className={`mt-5 grid gap-px border-y border-slate-200 bg-slate-200 ${gridClass}`}>
          <StatCard
            valueClass={valueClass}
            label="전체 참여"
            value={stats.totalParticipants}
            icon={<Users className="h-4 w-4 text-slate-400" />}
          />

          <StatCard
            valueClass={valueClass}
            label="공채 참여"
            value={stats.publicParticipants}
            icon={<ShieldCheck className="h-4 w-4 text-slate-400" />}
          />

          {careerExamEnabled && hasCombinedCareerStats ? (
            <StatCard
              valueClass={valueClass}
              label="경채 참여"
              value={stats.careerParticipants ?? 0}
              icon={<ShieldCheck className="h-4 w-4 text-slate-400" />}
            />
          ) : null}

          {careerExamEnabled && !hasCombinedCareerStats ? (
            <>
              <StatCard
                valueClass={valueClass}
                label="구조 경채"
                value={stats.careerRescueParticipants ?? 0}
                icon={<ShieldCheck className="h-4 w-4 text-slate-400" />}
              />
              <StatCard
                valueClass={valueClass}
                label="소방학과 경채"
                value={stats.careerAcademicParticipants ?? 0}
                icon={<ShieldCheck className="h-4 w-4 text-slate-400" />}
              />
              <StatCard
                valueClass={valueClass}
                label="구급 경채"
                value={stats.careerEmtParticipants ?? 0}
                icon={<ShieldCheck className="h-4 w-4 text-slate-400" />}
              />
            </>
          ) : null}

          <StatCard
            valueClass={valueClass}
            label="최근 1시간"
            value={stats.recentParticipants}
            icon={<Clock3 className="h-4 w-4 text-slate-400" />}
          />
        </div>
      </div>
    </section>
  );
}
