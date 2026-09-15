"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useReportDocument } from "../ReportPresentation";

const number = (value: number) => Number(value.toFixed(1));
const tick = { fill: "var(--admin-text-secondary)", fontSize: "var(--admin-type-caption)" };

export function SubjectScoreComparison({ name, mine, external, internal, maximum }: {
  name: string; mine: number | null; external: number | null; internal: number | null; maximum?: number;
}) {
  const document = useReportDocument();
  if (!document) return null;
  const values = [{ name: "내 점수", value: mine }, { name: "외부 평균", value: external }, { name: "반 평균", value: internal }];
  const data = values.filter((row): row is { name: string; value: number } => row.value != null && Number.isFinite(row.value));
  if (!data.length) return <p className="admin-help">비교할 점수 자료가 없습니다.</p>;
  const gap = mine != null && external != null ? number(mine - external) : null;
  return <section className="admin-section">
    <h3 className="admin-section-title">{name} 평균과 비교</h3>
    <p className="admin-help">{gap == null ? "외부 평균과 비교할 자료가 부족합니다." : gap === 0 ? "외부 평균과 같은 점수입니다." : `외부 평균보다 ${Math.abs(gap)}점 ${gap > 0 ? "높습니다" : "낮습니다"}.`}</p>
    <div className="h-64 w-full min-w-0" role="img" aria-label={`${name} 점수 비교. ${values.map(row => `${row.name} ${row.value == null ? "자료 없음" : `${number(row.value)}점`}`).join(", ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 16, right: 40, bottom: 16, left: 0 }}>
          <CartesianGrid stroke="var(--admin-grid)" horizontal={false} />
          <XAxis type="number" domain={[0, maximum && maximum > 0 ? maximum : "auto"]} tick={tick} />
          <YAxis type="category" dataKey="name" width={80} tick={tick} tickLine={false} />
          <Tooltip formatter={value => [`${number(Number(value))}점`, "점수"]} contentStyle={{ fontSize: "var(--admin-type-caption)" }} />
          <Bar dataKey="value" name="점수" isAnimationActive={false} barSize={24}>
            {data.map(row => <Cell key={row.name} fill={row.name === "내 점수" ? "var(--admin-accent)" : "var(--admin-text-muted)"} />)}
            <LabelList dataKey="value" position="right" formatter={value => number(Number(value))} fill="var(--admin-text)" fontSize="var(--admin-type-caption)" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    <p className="admin-help">{values.map(row => `${row.name} ${row.value == null ? "자료 없음" : `${number(row.value)}점`}`).join(" · ")}</p>
  </section>;
}

export function AnswerBreakdown({ correct, wrong, unanswered }: { correct: number; wrong: number; unanswered: number }) {
  const document = useReportDocument();
  if (!document) return null;
  const data = [{ name: "정답", value: correct, color: "var(--admin-success)" }, { name: "오답", value: wrong, color: "var(--admin-danger)" }, { name: "무응답", value: unanswered, color: "var(--admin-text-muted)" }];
  const total = correct + wrong + unanswered;
  if (!total) return <p className="admin-help">문항 결과가 없어 비중을 표시할 수 없습니다.</p>;
  return <section className="admin-section">
    <h3 className="admin-section-title">문항 결과 비중</h3>
    <div className="h-64 w-full min-w-0" role="img" aria-label={data.map(row => `${row.name} ${row.value}개`).join(", ")}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data.filter(row => row.value > 0)} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" isAnimationActive={false}>
            {data.filter(row => row.value > 0).map(row => <Cell key={row.name} fill={row.color} />)}
          </Pie>
          <Tooltip formatter={value => [`${value}개`, "문항 수"]} contentStyle={{ fontSize: "var(--admin-type-caption)" }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
    <ul className="flex flex-wrap gap-4 admin-help" aria-label="문항 결과 범례">
      {data.map(row => <li key={row.name} className="flex items-center gap-2"><span className="h-3 w-3 shrink-0" style={{ backgroundColor: row.color }} aria-hidden="true" />{row.name} {row.value}개 ({number(row.value / total * 100)}%)</li>)}
    </ul>
  </section>;
}
