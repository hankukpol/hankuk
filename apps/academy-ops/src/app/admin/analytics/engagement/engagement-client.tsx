"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type EngagementStudentData = {
  examNumber: string;
  name: string;
  attendanceRate: number;
  trend: "improving" | "declining" | "stable";
  hasPointsThisMonth: boolean;
  hasCounselingThisMonth: boolean;
  engagementScore: number;
  tier: "A" | "B" | "C" | "D";
};

type Props = {
  examType: string;
  weeks: string;
};

const TIER_CONFIG = {
  A: {
    label: "A등급",
    color: "text-forest",
    bgColor: "bg-forest/10",
    borderColor: "border-forest/30",
    badgeCls: "bg-forest/10 border-forest/30 text-forest",
    barCls: "bg-forest",
  },
  B: {
    label: "B등급",
    color: "text-sky-700",
    bgColor: "bg-sky-50",
    borderColor: "border-sky-200",
    badgeCls: "bg-sky-50 border-sky-200 text-sky-700",
    barCls: "bg-sky-500",
  },
  C: {
    label: "C등급",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    badgeCls: "bg-amber-50 border-amber-200 text-amber-700",
    barCls: "bg-amber-400",
  },
  D: {
    label: "D등급",
    color: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    badgeCls: "bg-red-50 border-red-200 text-red-700",
    barCls: "bg-red-500",
  },
};

function TierBadge({ tier }: { tier: EngagementStudentData["tier"] }) {
  const config = TIER_CONFIG[tier];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${config.badgeCls}`}
    >
      {config.label}
    </span>
  );
}

function TrendIcon({ trend }: { trend: EngagementStudentData["trend"] }) {
  if (trend === "improving")
    return <span className="text-forest font-semibold">▲</span>;
  if (trend === "declining")
    return <span className="text-red-600 font-semibold">▼</span>;
  return <span className="text-slate">→</span>;
}

// CSS-based tier distribution bar
function TierDistributionBar({ students }: { students: EngagementStudentData[] }) {
  if (students.length === 0) return null;
  const total = students.length;
  const counts = { A: 0, B: 0, C: 0, D: 0 };
  for (const s of students) counts[s.tier]++;

  return (
    <div className="rounded-[24px] border border-ink/10 bg-white p-5">
      <h2 className="text-sm font-semibold text-ink">등급 분포</h2>
      <div className="mt-4 flex h-8 w-full overflow-hidden rounded-full">
        {(["A", "B", "C", "D"] as const).map((tier) => {
          const pct = (counts[tier] / total) * 100;
          if (pct < 0.5) return null;
          const config = TIER_CONFIG[tier];
          return (
            <div
              key={tier}
              style={{ width: `${pct}%` }}
              className={`${config.barCls} flex items-center justify-center text-xs font-bold text-white transition-all`}
              title={`${config.label}: ${counts[tier]}명 (${pct.toFixed(0)}%)`}
            >
              {pct >= 8 ? `${tier}` : ""}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        {(["A", "B", "C", "D"] as const).map((tier) => {
          const config = TIER_CONFIG[tier];
          const pct = Math.round((counts[tier] / total) * 100);
          return (
            <span key={tier} className="flex items-center gap-1.5">
              <span className={`inline-block h-3 w-3 rounded-full ${config.barCls}`} />
              <span className={config.color}>
                {config.label} {counts[tier]}명 ({pct}%)
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function EngagementClient({ examType, weeks }: Props) {
  const [students, setStudents] = useState<EngagementStudentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [sortAsc, setSortAsc] = useState(true); // true = low first (attention needed)

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ examType, weeks });
      const res = await fetch(
        `/api/admin/analytics/engagement?${params.toString()}`,
      );
      if (!res.ok) throw new Error("데이터를 불러오는 데 실패했습니다.");
      const json = await res.json() as { data: EngagementStudentData[] };
      setStudents(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [examType, weeks]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const sortedStudents = [...students].sort((a, b) =>
    sortAsc
      ? a.engagementScore - b.engagementScore
      : b.engagementScore - a.engagementScore,
  );

  const dStudents = students.filter((s) => s.tier === "D");
  const aStudents = students.filter((s) => s.tier === "A");
  const avgScore =
    students.length > 0
      ? Math.round(
          students.reduce((s, st) => s + st.engagementScore, 0) / students.length,
        )
      : 0;

  // Improved this month: we can track students who improved compared to avg
  // Since we don't have previous-month data in this endpoint, approximate with trend
  const improvedCount = students.filter((s) => s.trend === "improving").length;

  const allDSelected =
    dStudents.length > 0 &&
    dStudents.every((s) => selectedStudents.has(s.examNumber));

  const handleSelectAll = (examNumbers: string[], select: boolean) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      for (const en of examNumbers) {
        if (select) next.add(en);
        else next.delete(en);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-[20px] bg-ink/5" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[24px] border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">
            평균 참여도
          </p>
          <p className="mt-2 text-3xl font-bold text-ink">{avgScore}점</p>
          <p className="mt-1 text-xs text-slate">{students.length}명 분석</p>
        </div>
        <div className="rounded-[24px] border border-forest/20 bg-forest/10 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-forest">
            A등급 학생
          </p>
          <p className="mt-2 text-3xl font-bold text-forest">{aStudents.length}명</p>
          <p className="mt-1 text-xs text-forest/70">참여도 80점 이상</p>
        </div>
        <div className="rounded-[24px] border border-red-200 bg-red-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
            D등급 학생
          </p>
          <p className="mt-2 text-3xl font-bold text-red-700">{dStudents.length}명</p>
          <p className="mt-1 text-xs text-red-600/70">참여도 40점 미만</p>
        </div>
        <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
            이번달 향상 추이
          </p>
          <p className="mt-2 text-3xl font-bold text-sky-700">{improvedCount}명</p>
          <p className="mt-1 text-xs text-sky-700/70">성적 상승 중인 학생</p>
        </div>
      </div>

      {/* Tier Distribution */}
      <TierDistributionBar students={students} />

      {/* Formula Info */}
      <div className="rounded-[20px] border border-ink/10 bg-white p-5">
        <h3 className="text-sm font-semibold text-ink">참여도 점수 산식 (0-100점)</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate sm:grid-cols-4">
          <div className="rounded-xl border border-ink/5 bg-mist p-3">
            <p className="font-semibold text-ink">출결율 (40%)</p>
            <p className="mt-1">출석 / 전체 회차 × 40</p>
          </div>
          <div className="rounded-xl border border-ink/5 bg-mist p-3">
            <p className="font-semibold text-ink">성적 추이 (30%)</p>
            <p className="mt-1">향상 +15 / 안정 0 / 하락 -15</p>
          </div>
          <div className="rounded-xl border border-ink/5 bg-mist p-3">
            <p className="font-semibold text-ink">포인트 활동 (15%)</p>
            <p className="mt-1">이번달 포인트 획득 시 +15</p>
          </div>
          <div className="rounded-xl border border-ink/5 bg-mist p-3">
            <p className="font-semibold text-ink">상담 참여 (15%)</p>
            <p className="mt-1">이번달 상담 기록 시 +15</p>
          </div>
        </div>
      </div>

      {/* Student Table */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">학생 참여도 목록</h2>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSortAsc((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-4 py-1.5 text-xs font-medium text-slate hover:border-forest/40 hover:text-forest"
            >
              정렬: {sortAsc ? "낮은 순" : "높은 순"}
            </button>
            {dStudents.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  handleSelectAll(
                    dStudents.map((s) => s.examNumber),
                    !allDSelected,
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-4 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
              >
                D등급 전체 {allDSelected ? "해제" : "선택"}
              </button>
            )}
            {selectedStudents.size > 0 && (
              <Link
                href={`/admin/counseling?students=${[...selectedStudents].join(",")}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-ember px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-ember/80"
              >
                D등급 일괄 면담 신청 ({selectedStudents.size}명)
              </Link>
            )}
          </div>
        </div>

        {students.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 p-8 text-center">
            <p className="text-sm text-slate">해당 조건의 학생 데이터가 없습니다.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs font-semibold text-slate">
                  <th className="pb-2 pr-3 w-8">
                    <span className="sr-only">선택</span>
                  </th>
                  <th className="pb-2 pr-4">학번</th>
                  <th className="pb-2 pr-4">이름</th>
                  <th className="pb-2 pr-4 text-center">등급</th>
                  <th className="pb-2 pr-4 text-right">
                    <button
                      type="button"
                      onClick={() => setSortAsc((v) => !v)}
                      className="hover:text-forest"
                    >
                      참여도 점수 {sortAsc ? "▲" : "▼"}
                    </button>
                  </th>
                  <th className="pb-2 pr-4 text-right">출결율</th>
                  <th className="pb-2 pr-4 text-center">추이</th>
                  <th className="pb-2 pr-4 text-center">포인트</th>
                  <th className="pb-2 text-center">상담</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {sortedStudents.map((student) => {
                  const tierConfig = TIER_CONFIG[student.tier];
                  return (
                    <tr key={student.examNumber} className="hover:bg-mist/40">
                      <td className="py-2 pr-3">
                        <input
                          type="checkbox"
                          checked={selectedStudents.has(student.examNumber)}
                          onChange={() => {
                            setSelectedStudents((prev) => {
                              const next = new Set(prev);
                              if (next.has(student.examNumber))
                                next.delete(student.examNumber);
                              else next.add(student.examNumber);
                              return next;
                            });
                          }}
                          className="rounded"
                        />
                      </td>
                      <td className="py-2 pr-4">
                        <Link
                          href={`/admin/students/${student.examNumber}`}
                          className="font-mono text-xs font-medium text-forest hover:underline"
                        >
                          {student.examNumber}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 font-medium text-ink">
                        <Link
                          href={`/admin/students/${student.examNumber}`}
                          className="hover:text-forest hover:underline"
                        >
                          {student.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-4 text-center">
                        <TierBadge tier={student.tier} />
                      </td>
                      <td className="py-2 pr-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-ink/10">
                            <div
                              className={`h-full rounded-full ${tierConfig.barCls}`}
                              style={{ width: `${student.engagementScore}%` }}
                            />
                          </div>
                          <span className={`font-mono text-xs font-bold ${tierConfig.color}`}>
                            {student.engagementScore}점
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-xs text-slate">
                        {student.attendanceRate}%
                      </td>
                      <td className="py-2 pr-4 text-center">
                        <TrendIcon trend={student.trend} />
                      </td>
                      <td className="py-2 pr-4 text-center">
                        {student.hasPointsThisMonth ? (
                          <span className="text-xs font-semibold text-forest">P</span>
                        ) : (
                          <span className="text-xs text-slate">—</span>
                        )}
                      </td>
                      <td className="py-2 text-center">
                        {student.hasCounselingThisMonth ? (
                          <span className="text-xs font-semibold text-sky-600">C</span>
                        ) : (
                          <span className="text-xs text-slate">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
