import type { ReactNode } from "react";
import { Clock3, ShieldCheck, Users } from "lucide-react";

export interface LandingLiveStats {
  examName: string;
  examYear: number;
  examRound: number;
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
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <article className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-black text-slate-900">{value.toLocaleString("ko-KR")}명</p>
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
  const gridClass = careerExamEnabled
    ? hasCombinedCareerStats
      ? "xl:grid-cols-4"
      : "xl:grid-cols-6"
    : "xl:grid-cols-3";

  return (
    <section className="relative overflow-hidden border border-slate-200 bg-white p-6 sm:p-7">
      <div className="relative">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">합격예측 실시간 참여 현황</h2>
            <p className="mt-1 text-sm font-semibold text-fire-600">
              {stats.examYear}년 {stats.examRound}차 · {stats.examName}
            </p>
          </div>
          <p className="text-xs font-semibold text-slate-400">
            최근 갱신: {formatDateTime(stats.updatedAt)}
          </p>
        </div>

        <div className={`mt-5 grid gap-3 sm:grid-cols-2 ${gridClass}`}>
          <StatCard
            label="전체 참여"
            value={stats.totalParticipants}
            icon={<Users className="h-4 w-4 text-slate-400" />}
          />

          <StatCard
            label="공채 참여"
            value={stats.publicParticipants}
            icon={<ShieldCheck className="h-4 w-4 text-slate-400" />}
          />

          {careerExamEnabled && hasCombinedCareerStats ? (
            <StatCard
              label="경채 참여"
              value={stats.careerParticipants ?? 0}
              icon={<ShieldCheck className="h-4 w-4 text-slate-400" />}
            />
          ) : null}

          {careerExamEnabled && !hasCombinedCareerStats ? (
            <>
              <StatCard
                label="구조 경채"
                value={stats.careerRescueParticipants ?? 0}
                icon={<ShieldCheck className="h-4 w-4 text-slate-400" />}
              />
              <StatCard
                label="소방학과 경채"
                value={stats.careerAcademicParticipants ?? 0}
                icon={<ShieldCheck className="h-4 w-4 text-slate-400" />}
              />
              <StatCard
                label="구급 경채"
                value={stats.careerEmtParticipants ?? 0}
                icon={<ShieldCheck className="h-4 w-4 text-slate-400" />}
              />
            </>
          ) : null}

          <StatCard
            label="최근 1시간"
            value={stats.recentParticipants}
            icon={<Clock3 className="h-4 w-4 text-slate-400" />}
          />
        </div>
      </div>
    </section>
  );
}
