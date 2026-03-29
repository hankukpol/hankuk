"use client";

import { useState } from "react";
import Link from "next/link";

type CohortStats = {
  id: string;
  name: string;
  examCategory: string;
  startDate: string;
  endDate: string;
  totalEnrolled: number;
  activeAtEnd: number;
  completed: number;
  cancelled: number;
  finalAvgScore: number | null;
  overallAvgDelta: number | null;
  completionRate: number;
};

type Props = {
  cohorts: CohortStats[];
  completedCount: number;
  avgCompletionRate: number | null;
  avgFinalScore: number | null;
  bestCohortName: string | null;
  overallAvgScore: number | null;
  availableYears: number[];
  initialYear: string;
  initialCategory: string;
};

function getExamCategoryLabel(cat: string): string {
  const map: Record<string, string> = {
    GONGCHAE: "공채",
    GYEONGCHAE: "경채",
    SOGANG: "소강",
    CUSTOM: "기타",
  };
  return map[cat] ?? cat;
}

function getExamCategoryBadgeClass(cat: string): string {
  switch (cat) {
    case "GONGCHAE":
      return "bg-forest/10 text-forest border-forest/20";
    case "GYEONGCHAE":
      return "bg-ember/10 text-ember border-ember/20";
    default:
      return "bg-ink/10 text-ink border-ink/20";
  }
}

type SortKey = "completionRate" | "finalScore" | "date";

export function CompletionClient({
  cohorts,
  completedCount,
  avgCompletionRate,
  avgFinalScore,
  bestCohortName,
  overallAvgScore,
  availableYears,
  initialYear,
  initialCategory,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = [...cohorts].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "completionRate") cmp = a.completionRate - b.completionRate;
    else if (sortKey === "finalScore") {
      const as = a.finalAvgScore ?? -1;
      const bs = b.finalAvgScore ?? -1;
      cmp = as - bs;
    } else {
      cmp = new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
    }
    return sortAsc ? cmp : -cmp;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const sortLabel = (key: SortKey) => {
    if (sortKey !== key) return "↕";
    return sortAsc ? "↑" : "↓";
  };

  return (
    <div>
      {/* KPI Cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate">완료 기수 수</p>
          <p className="mt-2 text-3xl font-bold text-ink">{completedCount.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-slate">기수</p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate">평균 수료율</p>
          <p className="mt-2 text-3xl font-bold text-forest">
            {avgCompletionRate !== null ? `${avgCompletionRate}%` : "—"}
          </p>
          <div className="mt-2 rounded-full bg-mist" style={{ height: "6px" }}>
            {avgCompletionRate !== null && (
              <div
                className="h-full rounded-full bg-forest"
                style={{ width: `${avgCompletionRate}%` }}
              />
            )}
          </div>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate">평균 최종 점수</p>
          <p className="mt-2 text-3xl font-bold text-ink">
            {avgFinalScore !== null ? `${avgFinalScore}점` : "—"}
          </p>
          <p className="mt-0.5 text-xs text-slate">전체 평균 {overallAvgScore !== null ? `${overallAvgScore}점` : "—"}</p>
        </div>
        <div className="rounded-[20px] border border-ember/20 bg-ember/5 p-5 shadow-sm">
          <p className="text-xs font-medium text-ember">최우수 기수</p>
          <p className="mt-2 text-base font-bold text-ember leading-tight">
            {bestCohortName ?? "—"}
          </p>
          <p className="mt-1 text-xs text-ember/70">수료율 기준</p>
        </div>
      </div>

      {/* Filter form */}
      <form method="GET" className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-ink">시험 구분</label>
          <select
            name="category"
            defaultValue={initialCategory}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-2 text-sm"
          >
            <option value="">전체</option>
            <option value="GONGCHAE">공채</option>
            <option value="GYEONGCHAE">경채</option>
            <option value="SOGANG">소강</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-ink">연도</label>
          <select
            name="year"
            defaultValue={initialYear}
            className="rounded-2xl border border-ink/10 bg-white px-4 py-2 text-sm"
          >
            <option value="">전체</option>
            {availableYears.map((y) => (
              <option key={y} value={String(y)}>
                {y}년
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-forest"
        >
          조회
        </button>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate">
          정렬:
          {(["date", "completionRate", "finalScore"] as SortKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => handleSort(k)}
              className={[
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                sortKey === k
                  ? "border-forest/30 bg-forest/10 text-forest"
                  : "border-ink/10 bg-white text-slate hover:border-ink/30",
              ].join(" ")}
            >
              {k === "date" ? "날짜" : k === "completionRate" ? "수료율" : "최종점수"}{" "}
              {sortLabel(k)}
            </button>
          ))}
        </div>
      </form>

      {/* Cohort cards */}
      {sorted.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
          완료된 기수가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((cohort) => {
            const completionPct = cohort.completionRate;
            const activePct =
              cohort.totalEnrolled > 0
                ? Math.round((cohort.activeAtEnd / cohort.totalEnrolled) * 100)
                : 0;
            const cancelledPct =
              cohort.totalEnrolled > 0
                ? Math.round((cohort.cancelled / cohort.totalEnrolled) * 100)
                : 0;

            const deltaPositive =
              cohort.overallAvgDelta !== null && cohort.overallAvgDelta >= 0;

            return (
              <div
                key={cohort.id}
                className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${getExamCategoryBadgeClass(cohort.examCategory)}`}
                      >
                        {getExamCategoryLabel(cohort.examCategory)}
                      </span>
                      <h3 className="text-base font-bold text-ink">{cohort.name}</h3>
                    </div>
                    <p className="mt-1 text-xs text-slate">
                      {new Date(cohort.startDate).toLocaleDateString("ko-KR")} ~{" "}
                      {new Date(cohort.endDate).toLocaleDateString("ko-KR")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {cohort.finalAvgScore !== null && (
                      <div className="text-right">
                        <p className="text-xs text-slate">최종 평균</p>
                        <p className="text-lg font-bold text-ink">{cohort.finalAvgScore}점</p>
                        {cohort.overallAvgDelta !== null && (
                          <p
                            className={`text-xs font-semibold ${
                              deltaPositive ? "text-forest" : "text-ember"
                            }`}
                          >
                            {deltaPositive ? "+" : ""}
                            {cohort.overallAvgDelta}점
                          </p>
                        )}
                      </div>
                    )}
                    <Link
                      href={`/admin/cohorts/${cohort.id}`}
                      className="inline-flex items-center gap-1 rounded-full border border-ink/10 px-3 py-1.5 text-xs font-medium text-slate transition hover:border-ember/30 hover:text-ember"
                    >
                      이 기수 자세히 보기 →
                    </Link>
                  </div>
                </div>

                {/* Stats row */}
                <div className="mt-4 grid grid-cols-4 gap-3 text-center">
                  <div className="rounded-2xl bg-mist p-3">
                    <p className="text-xs text-slate">총 등록</p>
                    <p className="text-lg font-bold text-ink">{cohort.totalEnrolled}</p>
                    <p className="text-xs text-slate">명</p>
                  </div>
                  <div className="rounded-2xl bg-mist p-3">
                    <p className="text-xs text-slate">종료 시 재적</p>
                    <p className="text-lg font-bold text-forest">{cohort.activeAtEnd}</p>
                    <p className="text-xs text-slate">{activePct}%</p>
                  </div>
                  <div className="rounded-2xl bg-mist p-3">
                    <p className="text-xs text-slate">수료</p>
                    <p className="text-lg font-bold text-forest">{cohort.completed}</p>
                    <p className="text-xs text-slate">{completionPct}%</p>
                  </div>
                  <div className="rounded-2xl bg-mist p-3">
                    <p className="text-xs text-slate">취소/탈퇴</p>
                    <p className="text-lg font-bold text-ember">{cohort.cancelled}</p>
                    <p className="text-xs text-slate">{cancelledPct}%</p>
                  </div>
                </div>

                {/* Completion funnel */}
                <div className="mt-4 space-y-1.5">
                  <p className="text-xs font-medium text-slate">수료 퍼널</p>
                  {/* Enrolled bar */}
                  <div className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-right text-xs text-slate">등록</span>
                    <div className="flex-1 rounded-full bg-ink/10" style={{ height: "14px" }}>
                      <div className="h-full w-full rounded-full bg-ink/20" />
                    </div>
                    <span className="w-10 text-xs text-slate">{cohort.totalEnrolled}명</span>
                  </div>
                  {/* Active bar */}
                  <div className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-right text-xs text-slate">재적</span>
                    <div className="flex-1 rounded-full bg-forest/10" style={{ height: "14px" }}>
                      <div
                        className="h-full rounded-full bg-forest/50"
                        style={{
                          width: cohort.totalEnrolled > 0 ? `${activePct}%` : "0%",
                          minWidth: cohort.activeAtEnd > 0 ? "4px" : "0",
                        }}
                      />
                    </div>
                    <span className="w-10 text-xs text-slate">{cohort.activeAtEnd}명</span>
                  </div>
                  {/* Completed bar */}
                  <div className="flex items-center gap-2">
                    <span className="w-16 shrink-0 text-right text-xs text-slate">수료</span>
                    <div className="flex-1 rounded-full bg-forest/10" style={{ height: "14px" }}>
                      <div
                        className="h-full rounded-full bg-forest"
                        style={{
                          width: cohort.totalEnrolled > 0 ? `${completionPct}%` : "0%",
                          minWidth: cohort.completed > 0 ? "4px" : "0",
                        }}
                      />
                    </div>
                    <span className="w-10 text-xs text-slate">{cohort.completed}명</span>
                  </div>
                  {/* Cancelled bar */}
                  {cohort.cancelled > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-right text-xs text-slate">취소</span>
                      <div className="flex-1 rounded-full bg-ember/10" style={{ height: "14px" }}>
                        <div
                          className="h-full rounded-full bg-ember/60"
                          style={{
                            width: cohort.totalEnrolled > 0 ? `${cancelledPct}%` : "0%",
                            minWidth: "4px",
                          }}
                        />
                      </div>
                      <span className="w-10 text-xs text-slate">{cohort.cancelled}명</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
