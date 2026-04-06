"use client";

import { LoaderCircle, Trophy } from "lucide-react";
import { useState } from "react";
import { toast } from "@/lib/sonner";

import { StudyRankingTable } from "@/components/study-time/StudyRankingTable";
import {
  PortalMetricCard,
  PortalSectionHeader,
  portalSectionClass,
} from "@/components/student-view/StudentPortalUi";
import { formatStudyMinutes, getKstMonth } from "@/lib/study-time-meta";
import type { StudentStudyTimeRanking } from "@/lib/services/study-time.service";

type StudentStudyRankingPanelProps = {
  divisionSlug: string;
  initialRanking: StudentStudyTimeRanking;
};

export function StudentStudyRankingPanel({
  divisionSlug,
  initialRanking,
}: StudentStudyRankingPanelProps) {
  const [month, setMonth] = useState(initialRanking.month);
  const [ranking, setRanking] = useState(initialRanking);
  const [isLoading, setIsLoading] = useState(false);

  async function loadRanking(targetMonth: string) {
    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/${divisionSlug}/student/study-ranking?month=${targetMonth}`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "학습 랭킹을 불러오지 못했습니다.");
      }

      setRanking(data.ranking);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "학습 랭킹을 불러오지 못했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMonthChange(targetMonth: string) {
    setMonth(targetMonth);
    await loadRanking(targetMonth);
  }

  return (
    <div className="space-y-5">
      <section
        className={`${portalSectionClass} flex flex-col gap-4 md:flex-row md:items-end md:justify-between`}
      >
        <div>
          <p
            className="text-[12px] font-bold"
            style={{ color: "var(--division-color)" }}
          >
            MONTHLY RANKING
          </p>
          <h2 className="mt-1 text-[22px] font-bold tracking-tight text-[var(--foreground)]">
            월간 학습 랭킹
          </h2>
          <p className="mt-2 text-[13px] leading-[1.5] text-[var(--muted)]">
            모두 익명으로 표시되며, 전체 순위에서 내 위치와 월 누적 학습시간을 함께
            확인할 수 있습니다.
          </p>
        </div>

        <div>
          <label className="text-[12px] font-semibold text-[var(--muted)]">조회 월</label>
          <input
            type="month"
            value={month}
            max={getKstMonth()}
            onChange={(event) => void handleMonthChange(event.target.value)}
            className="mt-1 block rounded-[10px] border border-[var(--border)] bg-white px-4 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-slate-400"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PortalMetricCard
          label="내 순위"
          value={ranking.myRank ? `${ranking.myRank.rank}등` : "-"}
          caption={
            ranking.myRank
              ? `${ranking.studentCount}명 중 현재 순위`
              : "해당 월 순위가 없습니다."
          }
          valueToneClassName="text-[var(--division-color)]"
        />
        <PortalMetricCard
          label="내 누적 학습시간"
          value={ranking.myRank ? formatStudyMinutes(ranking.myRank.totalMinutes) : "0분"}
          caption={
            ranking.myRank
              ? `${ranking.myRank.studyDays}일 학습 기준`
              : "집계된 학습일이 없습니다."
          }
        />
        <PortalMetricCard
          label="일평균"
          value={
            ranking.myRank ? formatStudyMinutes(ranking.myRank.dailyAverageMinutes) : "0분"
          }
          caption={
            ranking.myRank
              ? `${ranking.month} 기준 일평균 학습시간`
              : "해당 월 기록이 없습니다."
          }
        />
      </section>

      <section className={portalSectionClass}>
        <PortalSectionHeader
          title="전체 익명 랭킹"
          description="이름은 모두 익명 처리되며, 내 행은 강조해서 보여줍니다."
          icon={<Trophy className="h-5 w-5" />}
          action={
            isLoading ? (
              <LoaderCircle className="h-5 w-5 animate-spin text-[var(--muted)]" />
            ) : null
          }
        />

        <div className="mt-4">
          <StudyRankingTable
            rows={ranking.rows.map((row, index) => ({
              key: `${row.rank}-${index}-${row.maskedName}`,
              rank: row.rank,
              name: row.maskedName,
              totalMinutes: row.totalMinutes,
              studyDays: row.studyDays,
              dailyAverageMinutes: row.dailyAverageMinutes,
              isMe: row.isMe,
            }))}
            emptyText="해당 월 학습 랭킹 데이터가 없습니다."
          />
        </div>
      </section>
    </div>
  );
}
