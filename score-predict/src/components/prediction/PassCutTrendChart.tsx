"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface PassCutSnapshot {
  participantCount: number;
  recruitCount: number;
  applicantCount: number | null;
  targetParticipantCount: number | null;
  coverageRate: number | null;
  stabilityScore: number | null;
  status:
    | "READY"
    | "COLLECTING_LOW_PARTICIPATION"
    | "COLLECTING_UNSTABLE"
    | "COLLECTING_MISSING_APPLICANT_COUNT"
    | "COLLECTING_INSUFFICIENT_SAMPLE";
  statusReason: string | null;
  averageScore: number | null;
  oneMultipleCutScore: number | null;
  sureMinScore: number | null;
  likelyMinScore: number | null;
  possibleMinScore: number | null;
}

interface PassCutHistoryRelease {
  releaseNumber: number;
  releasedAt: string;
  totalParticipantCount: number;
  snapshot: PassCutSnapshot | null;
}

interface PassCutTrendChartProps {
  releases: PassCutHistoryRelease[];
  current: PassCutSnapshot;
  myScore?: number | null;
}

function roundNumber(value: number): number {
  return Number(value.toFixed(2));
}

export default function PassCutTrendChart({ releases, current, myScore }: PassCutTrendChartProps) {
  const chartData = [
    ...releases.map((release) => {
      const snapshot = release.snapshot;
      const ready = snapshot?.status === "READY";
      return {
        name: `${release.releaseNumber}차`,
        participants: snapshot?.participantCount ?? 0,
        sure: ready ? snapshot?.sureMinScore ?? null : null,
        likely: ready ? snapshot?.likelyMinScore ?? null : null,
        possible: ready ? snapshot?.possibleMinScore ?? null : null,
        oneMultipleCut: ready ? snapshot?.oneMultipleCutScore ?? null : null,
      };
    }),
    {
      name: "현재",
      participants: current.participantCount,
      sure: current.status === "READY" ? current.sureMinScore : null,
      likely: current.status === "READY" ? current.likelyMinScore : null,
      possible: current.status === "READY" ? current.possibleMinScore : null,
      oneMultipleCut: current.status === "READY" ? current.oneMultipleCutScore : null,
    },
  ];

  const allScores = chartData
    .flatMap((row) => [row.sure, row.likely, row.possible, row.oneMultipleCut])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (typeof myScore === "number" && Number.isFinite(myScore)) {
    allScores.push(myScore);
  }

  const hasScoreData = allScores.length > 0;
  const minScore = hasScoreData ? Math.floor(Math.min(...allScores) / 5) * 5 - 5 : 0;
  const maxScore = hasScoreData ? Math.ceil(Math.max(...allScores) / 5) * 5 + 5 : 100;
  const showMyScore = typeof myScore === "number" && Number.isFinite(myScore) && hasScoreData;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <h3 className="text-base font-semibold text-slate-900">합격컷 변동 추이</h3>
      <div className="mt-4 h-[370px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
            {hasScoreData ? (
              <YAxis
                yAxisId="score"
                domain={[minScore, maxScore]}
                tick={{ fontSize: 12, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
            ) : null}
            <YAxis
              yAxisId="count"
              orientation="right"
              tick={{ fontSize: 12, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}
              formatter={(value: unknown, name: string | undefined) => {
                const num = typeof value === "number" ? value : Number(value ?? 0);
                const safeName = name ?? "";
                if (safeName === "참여자 수") {
                  return [`${Math.round(num).toLocaleString("ko-KR")}명`, safeName];
                }
                return [`${roundNumber(num)}점`, safeName];
              }}
            />
            <Legend />
            <Bar
              yAxisId="count"
              dataKey="participants"
              name="참여자 수"
              fill="#94a3b8"
              fillOpacity={0.35}
              maxBarSize={56}
            />
            {hasScoreData ? (
              <Line
                yAxisId="score"
                type="monotone"
                dataKey="oneMultipleCut"
                name="1배수컷"
                stroke="#dc2626"
                strokeWidth={2.5}
                dot={{ r: 4, fill: "#dc2626" }}
                connectNulls
              />
            ) : null}
            {hasScoreData ? (
              <Line
                yAxisId="score"
                type="monotone"
                dataKey="sure"
                name="확실권"
                stroke="#16a34a"
                strokeWidth={2}
                dot={{ r: 3, fill: "#16a34a" }}
                connectNulls
              />
            ) : null}
            {hasScoreData ? (
              <Line
                yAxisId="score"
                type="monotone"
                dataKey="likely"
                name="유력권"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 3, fill: "#2563eb" }}
                connectNulls
              />
            ) : null}
            {hasScoreData ? (
              <Line
                yAxisId="score"
                type="monotone"
                dataKey="possible"
                name="가능권"
                stroke="#f97316"
                strokeWidth={2}
                dot={{ r: 3, fill: "#f97316" }}
                connectNulls
              />
            ) : null}
            {showMyScore ? (
              <ReferenceLine
                yAxisId="score"
                y={myScore}
                stroke="#2563eb"
                strokeDasharray="6 4"
                strokeWidth={2}
                label={{
                  value: `내 점수 ${myScore.toFixed(1)}점`,
                  position: "insideTopRight",
                  fill: "#2563eb",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {!hasScoreData ? (
        <p className="mt-3 text-xs text-slate-500">
          아직 READY 상태의 합격권 컷 데이터가 부족해 참여자 수만 표시됩니다.
        </p>
      ) : null}
    </section>
  );
}