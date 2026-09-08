"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/sonner";

import { StudyRankingTable } from "@/components/study-time/StudyRankingTable";
import { formatStudyMinutes, getKstMonth } from "@/lib/study-time-meta";
import type { DivisionStudyTimeRanking } from "@/lib/services/study-time.service";

type AdminStudyRankingManagerProps = {
  divisionSlug: string;
  initialRanking: DivisionStudyTimeRanking;
};

export function AdminStudyRankingManager({
  divisionSlug,
  initialRanking,
}: AdminStudyRankingManagerProps) {
  const [month, setMonth] = useState(initialRanking.month);
  const [ranking, setRanking] = useState(initialRanking);
  const [isLoading, setIsLoading] = useState(false);
  const rankingRequestRef = useRef<AbortController | null>(null);

  useEffect(() => () => rankingRequestRef.current?.abort(), [divisionSlug]);

  const leader = ranking.rows[0] ?? null;

  async function loadRanking(targetMonth: string) {
    rankingRequestRef.current?.abort();
    const controller = new AbortController();
    rankingRequestRef.current = controller;
    setIsLoading(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/study-ranking?month=${targetMonth}`, {
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;

      if (!response.ok) {
        throw new Error(data.error ?? "학습시간 랭킹을 불러오지 못했습니다.");
      }

      setRanking(data.ranking);
    } catch (error) {
      if (controller.signal.aborted) return;
      toast.error(
        error instanceof Error ? error.message : "학습시간 랭킹을 불러오지 못했습니다.",
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
    <div className="admin-flat-page">
      <section className="admin-section">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="admin-help mt-2 leading-6">
              월별 누적 학습시간, 학습일, 일평균 학습시간을 기준으로 학생 랭킹을
              전체 순위로 확인합니다.
            </p>
          </div>

          <div>
            <label className="admin-label">조회 월</label>
            <input
              type="month"
              value={month}
              max={getKstMonth()}
              onChange={(event) => void handleMonthChange(event.target.value)}
              className="mt-1 block rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 transition"
            />
          </div>
        </div>
      </section>

      <section className="admin-metric-strip">
        <article className="admin-metric-box">
          <p className="admin-metric-box-label">
            조회 월
          </p>
          <p className="admin-metric-box-value">{ranking.month}</p>
          <p className="admin-help mt-2">
            달력에서 원하는 월을 선택할 수 있습니다.
          </p>
        </article>
        <article className="admin-metric-box">
          <p className="admin-metric-box-label">
            랭킹 대상
          </p>
          <p className="admin-metric-box-value">{ranking.studentCount}명</p>
          <p className="admin-help mt-2">
            재원 및 휴원 학생 기준으로 집계합니다.
          </p>
        </article>
        <article className="admin-metric-box">
          <p className="admin-metric-box-label">
            1위 누적 학습시간
          </p>
          <p className="admin-metric-box-value">
            {leader ? formatStudyMinutes(leader.totalMinutes) : "-"}
          </p>
          <p className="admin-help mt-2">
            {leader
              ? `${leader.studentName} · ${leader.studyDays}일`
              : "해당 월 학습 기록이 없습니다."}
          </p>
        </article>
      </section>

      <section className="admin-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="admin-section-title">전체 랭킹</h3>
          </div>

          {isLoading ? <LoaderCircle className="h-5 w-5 animate-spin text-slate-400" /> : null}
        </div>

        <div className="mt-5">
          <StudyRankingTable
            rows={ranking.rows.map((row) => ({
              key: row.studentId,
              rank: row.rank,
              name: row.studentName,
              studentNumber: row.studentNumber,
              totalMinutes: row.totalMinutes,
              studyDays: row.studyDays,
              dailyAverageMinutes: row.dailyAverageMinutes,
            }))}
            showStudentNumber
            emptyText="해당 월 학습 랭킹 데이터가 없습니다."
          />
        </div>
      </section>
    </div>
  );
}
