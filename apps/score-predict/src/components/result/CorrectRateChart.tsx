"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface SubjectAnswerRow {
  questionNumber: number;
  isCorrect: boolean;
  correctRate: number;
}

interface SubjectChartItem {
  subjectId: number;
  subjectName: string;
  answers: SubjectAnswerRow[];
}

interface CorrectRateChartProps {
  subjects: SubjectChartItem[];
}

export default function CorrectRateChart({ subjects }: CorrectRateChartProps) {
  const [selectedSubjectId, setSelectedSubjectId] = useState<number>(subjects[0]?.subjectId ?? 0);

  const selectedSubject = useMemo(() => {
    return subjects.find((subject) => subject.subjectId === selectedSubjectId) ?? subjects[0] ?? null;
  }, [selectedSubjectId, subjects]);

  const chartData = useMemo(() => {
    if (!selectedSubject) return [];
    return selectedSubject.answers.map((answer) => ({
      key: String(answer.questionNumber),
      questionNumber: answer.questionNumber,
      correctRate: answer.correctRate,
      isCorrect: answer.isCorrect,
    }));
  }, [selectedSubject]);

  const hasChartData = chartData.length > 0;

  if (!selectedSubject) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">문항별 정답률 분포</h2>
        <p className="mt-3 text-sm text-slate-500">표시할 데이터가 없습니다.</p>
      </section>
    );
  }

  if (!hasChartData) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">문항별 정답률 분포</h2>
          <select
            className="h-9 rounded-md border border-slate-300 px-3 text-sm"
            value={selectedSubject.subjectId}
            onChange={(event) => setSelectedSubjectId(Number(event.target.value))}
          >
            {subjects.map((subject) => (
              <option key={subject.subjectId} value={subject.subjectId}>
                {subject.subjectName}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-3 text-sm text-slate-500">정답률 데이터가 없어 표시할 문항이 없습니다.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">문항별 정답률 분포</h2>
        <select
          className="h-9 rounded-md border border-slate-300 px-3 text-sm"
          value={selectedSubject.subjectId}
          onChange={(event) => setSelectedSubjectId(Number(event.target.value))}
        >
          {subjects.map((subject) => (
            <option key={subject.subjectId} value={subject.subjectId}>
              {subject.subjectName}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 hidden h-[320px] md:block">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 8, left: -12, bottom: 8 }}>
            <CartesianGrid stroke="#e2e8f0" vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="questionNumber"
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}
              formatter={(value: unknown) => `${Number(value ?? 0).toFixed(1)}%`}
            />
            <ReferenceLine
              y={40}
              stroke="#ef4444"
              strokeDasharray="4 4"
              label={{ value: "40% 기준선", position: "insideTopRight", fill: "#ef4444", fontSize: 11 }}
            />
            <Bar dataKey="correctRate" radius={[4, 4, 0, 0]} maxBarSize={28}>
              {chartData.map((item) => (
                <Cell key={item.key} fill={item.isCorrect ? "#2563eb" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 space-y-2 md:hidden">
        {chartData.map((item) => (
          <div key={item.key} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <p className="font-semibold text-slate-800">{item.questionNumber}번</p>
              <p className={`font-semibold ${item.isCorrect ? "text-blue-700" : "text-rose-700"}`}>
                {item.correctRate.toFixed(1)}%
              </p>
            </div>
            <div className="mt-2 h-2 rounded-full bg-slate-200">
              <div
                className={`h-2 rounded-full ${item.isCorrect ? "bg-blue-600" : "bg-rose-500"}`}
                style={{ width: `${Math.max(0, Math.min(100, item.correctRate))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
        <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">파란색: 내가 맞힌 문항</span>
        <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">빨간색: 내가 틀린 문항</span>
      </div>
    </section>
  );
}
