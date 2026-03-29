"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface DistributionBucket {
  bucket: number;
  label: string;
  bucketStart: number;
  bucketEnd: number;
  count: number;
  isMyBucket: boolean;
}

interface ScoreDistributionChartProps {
  submissionId: number;
}

export default function ScoreDistributionChart({ submissionId }: ScoreDistributionChartProps) {
  const [buckets, setBuckets] = useState<DistributionBucket[]>([]);
  const [isCollecting, setIsCollecting] = useState(false);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function fetchDistribution() {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const response = await fetch(`/api/analysis/score-distribution?submissionId=${submissionId}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json()) as {
          success?: boolean;
          error?: string;
          data?: {
            isCollecting: boolean;
            myScore: number;
            buckets: DistributionBucket[];
          };
        };

        if (!response.ok) {
          if (response.status === 404) {
            if (!mounted) return;
            setIsCollecting(true);
            setBuckets([]);
            setMyScore(null);
            return;
          }
          throw new Error(payload.error ?? "점수대 분포 데이터를 불러오지 못했습니다.");
        }

        if (!mounted) return;
        setIsCollecting(Boolean(payload.data?.isCollecting));
        setMyScore(typeof payload.data?.myScore === "number" ? payload.data.myScore : null);
        setBuckets(payload.data?.buckets ?? []);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(error instanceof Error ? error.message : "점수대 분포 데이터를 불러오지 못했습니다.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    void fetchDistribution();
    return () => {
      mounted = false;
    };
  }, [submissionId]);

  if (isLoading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        점수대 분포를 불러오는 중입니다...
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

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">점수대별 인원 분포</h2>
        <p className="text-xs text-slate-500">기준: 동일 시험·직렬 전체 입력자 · 원점수 기준</p>
      </div>
      {isCollecting ? <p className="mt-3 text-sm text-slate-600">참여 인원이 10명 미만이라 데이터 수집 중입니다.</p> : null}

      {!isCollecting ? (
        <>
          <div className="mt-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={buckets} margin={{ top: 20, right: 12, left: -12, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="label"
                  interval={2}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value: unknown) => `${Number(value ?? 0)}명`}
                  labelFormatter={(label: unknown) => `${String(label)}점`}
                  contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {buckets.map((bucket) => (
                    <Cell key={bucket.bucket} fill={bucket.isMyBucket ? "#2563eb" : "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-sm text-slate-600">파란색 막대는 내 점수 구간입니다. {myScore !== null ? `내 점수: ${myScore.toFixed(1)}점` : ""}</p>
        </>
      ) : null}
    </section>
  );
}
