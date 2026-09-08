"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RegularStudentReport } from "@/lib/exam-analysis-types";

type Props = { distribution: Omit<RegularStudentReport["distribution"], "myBinIndex"> & { myBinIndex?: number | null } };

export function DistributionBars({ distribution }: Props) {
  if (!distribution || distribution.bins.length === 0) return <p className="admin-help">분포를 집계할 수 없습니다.</p>;
  const data = distribution.bins.map((bin, index) => ({ ...bin, label: `${bin.lo}~${bin.hi}`, mine: index === distribution.myBinIndex }));
  return <div className="admin-section">
    <p className="admin-help">외부 응시자 점수 분포입니다. 구간은 하한 이상, 상한 미만이며 마지막 구간은 상한을 포함합니다. {distribution.myBinIndex != null ? "내 구간은 강조색과 ‘내 구간’ 문구로 표시합니다." : ""}</p>
    <div className="h-80" role="img" aria-label="외부 응시자 점수 구간별 인원, 상세 수치는 아래 표 참고">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid stroke="var(--admin-grid)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "var(--admin-text-muted)", fontSize: "var(--admin-type-caption)" }} />
          <YAxis allowDecimals={false} tick={{ fill: "var(--admin-text-muted)", fontSize: "var(--admin-type-caption)" }} />
          <Tooltip contentStyle={{ fontSize: "var(--admin-type-caption)" }} />
          <Bar dataKey="count" name="응시 인원" isAnimationActive={false}>
            {data.map((bin) => <Cell key={bin.label} fill={bin.mine ? "var(--admin-accent)" : "var(--admin-chart-2)"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    <details><summary className="admin-button">분포 수치 보기</summary><div className="admin-table-frame"><table><thead><tr><th scope="col">점수 구간</th><th scope="col">인원</th><th scope="col">비율</th><th scope="col">내 위치</th></tr></thead><tbody>
      {data.map((bin) => <tr key={bin.label}><td>{bin.label}</td><td>{bin.count}명</td><td>{bin.ratio}%</td><td>{bin.mine ? "내 구간" : "-"}</td></tr>)}
    </tbody></table></div></details>
  </div>;
}
