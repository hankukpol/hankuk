"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface SubjectStatsItem {
  subjectId: number;
  subjectName: string;
  myScore: number;
  averageScore: number;
  maxPossible: number;
}

interface SubjectComparisonChartProps {
  submissionId: number;
}

export default function SubjectComparisonChart({ submissionId }: SubjectComparisonChartProps) {
  const [subjects, setSubjects] = useState<SubjectStatsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function fetchStats() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const response = await fetch(`/api/analysis/subject-stats?submissionId=${submissionId}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          success?: boolean;
          error?: string;
          data?: {
            subjects: SubjectStatsItem[];
          };
        };

        if (!response.ok) {
          if (response.status === 404) {
            if (!mounted) return;
            setSubjects([]);
            return;
          }
          throw new Error(payload.error ?? "과목별 비교 차트 데이터를 불러오지 못했습니다.");
        }

        if (!mounted) return;
        setSubjects(payload.data?.subjects ?? []);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error instanceof Error ? error.message : "과목별 비교 차트 데이터를 불러오지 못했습니다.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void fetchStats();
    return () => {
      mounted = false;
    };
  }, [submissionId]);

  const maxValue = useMemo(() => {
    if (subjects.length < 1) return 100;
    return Math.max(...subjects.map((subject) => subject.maxPossible));
  }, [subjects]);

  if (isLoading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        과목별 비교 차트를 불러오는 중입니다...
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
        {errorMessage}
      </section>
    );
  }

  if (subjects.length < 1) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        표시할 과목별 비교 데이터가 없습니다.
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">과목별 비교 차트</h2>
        <p className="text-xs text-slate-500">기준: 동일 시험·직렬 전체 입력자</p>
      </div>
      <div className="mt-4 h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={subjects} margin={{ top: 16, right: 12, left: -12, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="subjectName" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <YAxis
              domain={[0, maxValue]}
              tick={{ fontSize: 12, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: unknown) => `${Number(value ?? 0).toFixed(1)}점`}
              contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}
            />
            <Bar dataKey="myScore" name="내 점수" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="averageScore" name="전체 평균" fill="#8bc34a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
