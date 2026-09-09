"use client";

import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import type { RegularStudentReport } from "@/lib/exam-analysis-types";

export function SubjectRadar({ subjects }: { subjects: RegularStudentReport["stats"]["subjects"] }) {
  const normalize = (score: number | null, full: number) => score == null || full <= 0 ? null : score / full * 100;
  const data = subjects.map((subject) => ({ name: subject.name, mine: normalize(subject.my, subject.fullScore), external: normalize(subject.externalAvg, subject.fullScore), internal: normalize(subject.internalAvg, subject.fullScore) }));
  if (!data.length) return null;
  return <div className="hidden md:block" role="img" aria-label="과목별 만점 대비 내 점수, 외부 평균, 반 평균 비교. 상세 수치는 과목별 표 참고">
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data}>
          <PolarGrid stroke="var(--admin-grid)" />
          <PolarAngleAxis dataKey="name" tick={{ fill: "var(--admin-text)", fontSize: "var(--admin-type-caption)" }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fill: "var(--admin-text-muted)", fontSize: "var(--admin-type-caption)" }} />
          <Radar name="내 점수" dataKey="mine" stroke="var(--admin-chart-1)" fill="none" isAnimationActive={false} />
          <Radar name="외부 평균" dataKey="external" stroke="var(--admin-chart-2)" fill="none" isAnimationActive={false} />
          <Radar name="반 평균" dataKey="internal" stroke="var(--admin-chart-3)" fill="none" isAnimationActive={false} />
          <Tooltip contentStyle={{ fontSize: "var(--admin-type-caption)" }} />
          <Legend wrapperStyle={{ fontSize: "var(--admin-type-caption)" }} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  </div>;
}
