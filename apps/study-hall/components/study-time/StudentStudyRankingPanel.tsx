"use client";

import { LoaderCircle, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/sonner";

import { StudyRankingTable } from "@/components/study-time/StudyRankingTable";
import {
  PortalMetricCard,
  PortalSectionHeader,
  portalMetricGrid3Class,
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
  const rankingRequestRef = useRef<AbortController | null>(null);

  useEffect(() => () => rankingRequestRef.current?.abort(), [divisionSlug]);

  async function loadRanking(targetMonth: string) {
    rankingRequestRef.current?.abort();
    const controller = new AbortController();
    rankingRequestRef.current = controller;
    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/${divisionSlug}/student/study-ranking?month=${targetMonth}`,
        { signal: controller.signal },
      );
      const data = await response.json();
      if (controller.signal.aborted) return;

      if (!response.ok) {
        throw new Error(data.error ?? "학습 랭킹을 불러오지 못했습니다.");
      }

      setRanking(data.ranking);
    } catch (error) {
      if (controller.signal.aborted) return;
      toast.error(
        error instanceof Error ? error.message : "학습 랭킹을 불러오지 못했습니다.",
      );
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }

  async function handleMonthChange(targetMonth: string) {
    setMonth(targetMonth);
    await loadRanking(targetMonth);
  }

  return (
    <div className="space-y-5">
      {/* DESIGN.md 1절 — 장식용 영문 소제목을 제목 위에 얹지 않는다.
          5.7절 — 라벨은 .admin-label, 입력 규격은 전역 기본값이 담당한다. */}
      <section className="admin-section flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h2 className="admin-section-title">월간 학습 랭킹</h2>
          <p className="admin-help mt-1.5">
            모두 익명으로 표시되며, 전체 순위에서 내 위치와 월 누적 학습시간을 함께
            확인할 수 있습니다.
          </p>
        </div>

        <label className="block w-full md:w-[200px]">
          <span className="admin-label block">조회 월</span>
          <input
            type="month"
            value={month}
            max={getKstMonth()}
            onChange={(event) => void handleMonthChange(event.target.value)}
            className="mt-2"
          />
        </label>
      </section>

      <section className={portalMetricGrid3Class}>
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

      <section className="admin-section">
        <PortalSectionHeader
          title="전체 익명 랭킹"
          description="이름은 모두 익명 처리되며, 내 행은 강조해서 보여줍니다."
          icon={<Trophy className="h-5 w-5" />}
          action={
            isLoading ? (
              <LoaderCircle className="h-5 w-5 animate-spin text-admin-text-muted" />
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
