"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";
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

  const leader = ranking.rows[0] ?? null;

  async function loadRanking(targetMonth: string) {
    setIsLoading(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/study-ranking?month=${targetMonth}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "학습시간 랭킹을 불러오지 못했습니다.");
      }

      setRanking(data.ranking);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "학습시간 랭킹을 불러오지 못했습니다.",
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
    <div className="space-y-6">
      <section className="rounded-[10px] border border-slate-200 bg-white p-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              월간 랭킹
            </p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">학습시간 랭킹</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              월별 누적 학습시간, 학습일, 일평균 학습시간을 기준으로 학생 랭킹을
              전체 순위로 확인합니다.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500">조회 월</label>
            <input
              type="month"
              value={month}
              max={getKstMonth()}
              onChange={(event) => void handleMonthChange(event.target.value)}
              className="mt-1 block rounded-[10px] border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-400"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <article className="rounded-[10px] border border-slate-200 bg-white p-5 shadow-[0_12px_28px_rgba(18,32,56,0.05)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            조회 월
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{ranking.month}</p>
          <p className="mt-1 text-xs text-slate-500">
            달력에서 원하는 월을 선택할 수 있습니다.
          </p>
        </article>
        <article className="rounded-[10px] border border-slate-200 bg-white p-5 shadow-[0_12px_28px_rgba(18,32,56,0.05)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            랭킹 대상
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{ranking.studentCount}명</p>
          <p className="mt-1 text-xs text-slate-500">
            재원 및 휴원 학생 기준으로 집계합니다.
          </p>
        </article>
        <article className="rounded-[10px] border border-slate-200 bg-white p-5 shadow-[0_12px_28px_rgba(18,32,56,0.05)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            1위 누적 학습시간
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {leader ? formatStudyMinutes(leader.totalMinutes) : "-"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {leader
              ? `${leader.studentName} · ${leader.studyDays}일`
              : "해당 월 학습 기록이 없습니다."}
          </p>
        </article>
      </section>

      <section className="rounded-[10px] border border-slate-200 bg-white p-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              Ranking
            </p>
            <h3 className="mt-1 text-2xl font-bold text-slate-950">전체 랭킹</h3>
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
