"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type HistoricalPoint = {
  sessionIndex: number;
  avg: number;
  examDate: string;
};

type ProjectedPoint = {
  sessionIndex: number;
  projectedAvg: number;
};

type ForecastStudentData = {
  examNumber: string;
  name: string;
  historical: HistoricalPoint[];
  projected: ProjectedPoint[];
  slope: number;
  currentAvg: number;
  predictedAvg: number;
  trend: "declining" | "improving" | "stable";
};

type Props = {
  examType: string;
  weeks: string;
  mode: string;
};

function TrendBadge({ trend, slope }: { trend: ForecastStudentData["trend"]; slope: number }) {
  if (trend === "declining") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
        ▼ {Math.abs(slope).toFixed(2)}/회
      </span>
    );
  }
  if (trend === "improving") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
        ▲ +{slope.toFixed(2)}/회
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-ink/10 bg-ink/5 px-2.5 py-0.5 text-xs font-semibold text-slate">
      → {slope.toFixed(2)}/회
    </span>
  );
}

// SVG line chart for a single student's data
function StudentChart({ student }: { student: ForecastStudentData }) {
  const allPoints: { x: number; y: number; isProjected: boolean }[] = [
    ...student.historical.map((p) => ({
      x: p.sessionIndex,
      y: p.avg,
      isProjected: false,
    })),
    ...student.projected.map((p) => ({
      x: p.sessionIndex,
      y: p.projectedAvg,
      isProjected: true,
    })),
  ];

  if (allPoints.length < 2) return null;

  const width = 600;
  const height = 200;
  const paddingX = 40;
  const paddingY = 20;

  const minX = Math.min(...allPoints.map((p) => p.x));
  const maxX = Math.max(...allPoints.map((p) => p.x));
  const minY = Math.max(0, Math.min(...allPoints.map((p) => p.y)) - 10);
  const maxY = Math.min(100, Math.max(...allPoints.map((p) => p.y)) + 10);

  const toSvgX = (x: number) =>
    paddingX + ((x - minX) / Math.max(maxX - minX, 1)) * (width - paddingX * 2);
  const toSvgY = (y: number) =>
    height - paddingY - ((y - minY) / Math.max(maxY - minY, 1)) * (height - paddingY * 2);

  const historicalPath = student.historical
    .map((p, i) =>
      i === 0
        ? `M ${toSvgX(p.sessionIndex)},${toSvgY(p.avg)}`
        : `L ${toSvgX(p.sessionIndex)},${toSvgY(p.avg)}`,
    )
    .join(" ");

  // Join line: from last historical to first projected
  const lastHistorical = student.historical[student.historical.length - 1];
  const projectedPath =
    lastHistorical && student.projected.length > 0
      ? [
          `M ${toSvgX(lastHistorical.sessionIndex)},${toSvgY(lastHistorical.avg)}`,
          ...student.projected.map(
            (p) => `L ${toSvgX(p.sessionIndex)},${toSvgY(p.projectedAvg)}`,
          ),
        ].join(" ")
      : "";

  // Y grid lines at 40, 60, 80
  const gridYValues = [40, 60, 80];

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[320px]"
        style={{ maxWidth: width }}
      >
        {/* Grid lines */}
        {gridYValues.map((yVal) => (
          <g key={yVal}>
            <line
              x1={paddingX}
              y1={toSvgY(yVal)}
              x2={width - paddingX}
              y2={toSvgY(yVal)}
              stroke="#e5e7eb"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <text
              x={paddingX - 4}
              y={toSvgY(yVal) + 4}
              fontSize="10"
              fill="#6b7280"
              textAnchor="end"
            >
              {yVal}
            </text>
          </g>
        ))}

        {/* Historical line */}
        <path
          d={historicalPath}
          fill="none"
          stroke="#1F4D3A"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Projected line (dashed) */}
        {projectedPath && (
          <path
            d={projectedPath}
            fill="none"
            stroke="#C55A11"
            strokeWidth="2"
            strokeDasharray="6 4"
            strokeLinecap="round"
          />
        )}

        {/* Historical dots */}
        {student.historical.map((p) => (
          <circle
            key={`h-${p.sessionIndex}`}
            cx={toSvgX(p.sessionIndex)}
            cy={toSvgY(p.avg)}
            r="4"
            fill="#1F4D3A"
            stroke="white"
            strokeWidth="1.5"
          />
        ))}

        {/* Projected dots */}
        {student.projected.map((p) => (
          <circle
            key={`p-${p.sessionIndex}`}
            cx={toSvgX(p.sessionIndex)}
            cy={toSvgY(p.projectedAvg)}
            r="4"
            fill="white"
            stroke="#C55A11"
            strokeWidth="2"
          />
        ))}
      </svg>

      {/* Chart legend */}
      <div className="mt-2 flex items-center gap-4 text-xs text-slate">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-6 rounded bg-forest" />
          실제 성적
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-6 rounded bg-ember"
            style={{ backgroundImage: "repeating-linear-gradient(90deg, #C55A11 0, #C55A11 6px, transparent 6px, transparent 10px)" }}
          />
          예측 성적
        </span>
      </div>
    </div>
  );
}

export function ForecastClient({ examType, weeks, mode }: Props) {
  const [students, setStudents] = useState<ForecastStudentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<ForecastStudentData | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        examType,
        weeks,
        mode,
        limit: "20",
      });
      const res = await fetch(`/api/admin/analytics/score-forecast?${params.toString()}`);
      if (!res.ok) throw new Error("데이터를 불러오는 데 실패했습니다.");
      const json = await res.json() as { data: ForecastStudentData[] };
      setStudents(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [examType, weeks, mode]);

  useEffect(() => {
    void fetchStudents();
  }, [fetchStudents]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchResult(null);
    try {
      const params = new URLSearchParams({
        examType,
        weeks,
        mode: "all",
        examNumber: searchQuery.trim(),
        limit: "1",
      });
      const res = await fetch(`/api/admin/analytics/score-forecast?${params.toString()}`);
      if (!res.ok) throw new Error("검색 실패");
      const json = await res.json() as { data: ForecastStudentData[] };
      setSearchResult(json.data?.[0] ?? null);
    } catch {
      setSearchResult(null);
    } finally {
      setSearchLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
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
      {/* Student Search */}
      <div className="rounded-[24px] border border-ink/10 bg-white p-5">
        <h2 className="text-sm font-semibold text-ink">학생 개별 검색</h2>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSearch();
            }}
            placeholder="학번 입력..."
            className="flex-1 rounded-full border border-ink/10 px-4 py-2 text-sm focus:border-forest/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleSearch()}
            disabled={searchLoading}
            className="inline-flex items-center rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {searchLoading ? "검색 중..." : "검색"}
          </button>
        </div>

        {searchResult && (
          <div className="mt-4 rounded-[20px] border border-forest/20 bg-forest/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <Link
                  href={`/admin/students/${searchResult.examNumber}`}
                  className="font-semibold text-ink hover:text-forest hover:underline"
                >
                  {searchResult.name}
                </Link>
                <span className="ml-2 font-mono text-xs text-slate">{searchResult.examNumber}</span>
              </div>
              <TrendBadge trend={searchResult.trend} slope={searchResult.slope} />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-slate">현재 평균</p>
                <p className="text-lg font-bold text-ink">{searchResult.currentAvg.toFixed(1)}점</p>
              </div>
              <div>
                <p className="text-xs text-slate">예측 평균 (4회차 후)</p>
                <p className={`text-lg font-bold ${searchResult.predictedAvg < searchResult.currentAvg ? "text-red-600" : "text-forest"}`}>
                  {searchResult.predictedAvg.toFixed(1)}점
                </p>
              </div>
              <div>
                <p className="text-xs text-slate">변화</p>
                <p className={`text-lg font-bold ${searchResult.predictedAvg - searchResult.currentAvg < 0 ? "text-red-600" : "text-forest"}`}>
                  {searchResult.predictedAvg - searchResult.currentAvg > 0 ? "+" : ""}
                  {(searchResult.predictedAvg - searchResult.currentAvg).toFixed(1)}점
                </p>
              </div>
            </div>
            <div className="mt-4">
              <StudentChart student={searchResult} />
            </div>
          </div>
        )}

        {searchResult === null && searchQuery && !searchLoading && (
          <p className="mt-2 text-xs text-slate">검색 결과가 없습니다.</p>
        )}
      </div>

      {/* Declining students list */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {mode === "declining" ? "하락 중인 학생" : mode === "improving" ? "향상 중인 학생" : "전체 학생"} 목록
          </h2>
          <span className="text-sm text-slate">{students.length}명</span>
        </div>

        {students.length === 0 ? (
          <div className="mt-6 rounded-[20px] border border-dashed border-ink/10 p-8 text-center">
            <p className="text-sm text-slate">해당 조건의 학생이 없습니다.</p>
            <p className="mt-1 text-xs text-slate">최소 4개 이상 회차 성적이 필요합니다.</p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs font-semibold text-slate">
                  <th className="pb-2 pr-4">이름</th>
                  <th className="pb-2 pr-4">학번</th>
                  <th className="pb-2 pr-4 text-right">현재 평균</th>
                  <th className="pb-2 pr-4 text-right">예측 평균</th>
                  <th className="pb-2 pr-4">추세</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {students.map((student) => (
                  <>
                    <tr
                      key={student.examNumber}
                      className="cursor-pointer hover:bg-mist/40"
                      onClick={() =>
                        setExpandedStudent((prev) =>
                          prev === student.examNumber ? null : student.examNumber,
                        )
                      }
                    >
                      <td className="py-3 pr-4 font-medium text-ink">
                        <Link
                          href={`/admin/students/${student.examNumber}`}
                          className="hover:text-forest hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {student.name}
                        </Link>
                      </td>
                      <td className="py-3 pr-4">
                        <Link
                          href={`/admin/students/${student.examNumber}`}
                          className="font-mono text-xs font-medium text-forest hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {student.examNumber}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono font-semibold text-ink">
                        {student.currentAvg.toFixed(1)}점
                      </td>
                      <td className="py-3 pr-4 text-right font-mono font-semibold">
                        <span
                          className={
                            student.predictedAvg < student.currentAvg
                              ? "text-red-600"
                              : "text-forest"
                          }
                        >
                          {student.predictedAvg.toFixed(1)}점
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <TrendBadge trend={student.trend} slope={student.slope} />
                      </td>
                      <td className="py-3 text-right text-xs text-slate">
                        {expandedStudent === student.examNumber ? "▲" : "▼"}
                      </td>
                    </tr>
                    {expandedStudent === student.examNumber && (
                      <tr key={`${student.examNumber}-chart`}>
                        <td colSpan={6} className="bg-mist/30 px-4 pb-4 pt-2">
                          <StudentChart student={student} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="rounded-[20px] border border-ink/10 bg-white p-5">
        <h3 className="text-sm font-semibold text-ink">분석 방법</h3>
        <ul className="mt-2 space-y-1 text-xs text-slate">
          <li>• 학생별 최근 회차 점수를 기반으로 선형 회귀(Linear Regression)를 적용합니다.</li>
          <li>• 최소 4회차 이상 성적이 있는 학생만 분석에 포함됩니다.</li>
          <li>• 기울기(slope) &lt; -1/회: 하락 중 / &gt; +1/회: 향상 중 / 그 외: 안정</li>
          <li>• 예측선(점선)은 현재 추세가 4회차 더 지속될 경우의 예상 점수입니다.</li>
        </ul>
      </div>
    </div>
  );
}
