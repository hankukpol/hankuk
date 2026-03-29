"use client";

import { useEffect, useState } from "react";
import { SUBJECT_LABEL } from "@/lib/constants";

type HeatmapData = {
  subjects: string[];
  weeks: number[];
  data: Record<string, Record<number, number | null>>;
};

function getHeatColor(score: number | null): string {
  if (score === null) return "bg-ink/5 text-slate/30";
  if (score >= 90) return "bg-forest text-white";
  if (score >= 80) return "bg-forest/70 text-white";
  if (score >= 70) return "bg-forest/45 text-ink";
  if (score >= 60) return "bg-amber-400/60 text-ink";
  if (score >= 50) return "bg-amber-500/50 text-ink";
  return "bg-red-500/50 text-white";
}

type Props = {
  examNumber: string;
  periodId: number;
};

export function SubjectHeatmap({ examNumber, periodId }: Props) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(
      `/api/analytics/subject-heatmap?examNumber=${encodeURIComponent(examNumber)}&periodId=${periodId}`,
    )
      .then((r) => r.json())
      .then((d: HeatmapData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [examNumber, periodId]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 rounded bg-ink/8" />
        ))}
      </div>
    );
  }

  if (!data || data.subjects.length === 0 || data.weeks.length === 0) {
    return <p className="text-sm text-slate">성적 데이터가 없습니다.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white px-3 py-2 text-left font-medium text-slate whitespace-nowrap">
              과목
            </th>
            {data.weeks.map((week) => (
              <th
                key={week}
                className="px-2 py-2 text-center font-medium text-slate whitespace-nowrap min-w-[48px]"
              >
                {week}주
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.subjects.map((subject) => (
            <tr key={subject}>
              <td className="sticky left-0 bg-white px-3 py-2 font-medium text-ink whitespace-nowrap">
                {(SUBJECT_LABEL as Record<string, string>)[subject] ?? subject}
              </td>
              {data.weeks.map((week) => {
                const score = data.data[subject]?.[week] ?? null;
                return (
                  <td
                    key={week}
                    className={`px-2 py-2 text-center font-medium rounded transition ${getHeatColor(score)}`}
                    title={
                      score !== null
                        ? `${subject} ${week}주: ${score}점`
                        : "데이터 없음"
                    }
                  >
                    {score !== null ? score : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-3 text-xs text-slate">
        <span>낮음</span>
        <div className="flex gap-1">
          <div className="h-4 w-6 rounded bg-red-500/50" />
          <div className="h-4 w-6 rounded bg-amber-500/50" />
          <div className="h-4 w-6 rounded bg-amber-400/60" />
          <div className="h-4 w-6 rounded bg-forest/45" />
          <div className="h-4 w-6 rounded bg-forest/70" />
          <div className="h-4 w-6 rounded bg-forest" />
        </div>
        <span>높음</span>
      </div>
    </div>
  );
}
