"use client";

import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { GraduateBenchmarkData } from "@/lib/analytics/graduate-benchmark";
import { PASS_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { PassType, Subject } from "@prisma/client";

// ─── colours ─────────────────────────────────────────────────────────────────
const EMBER = "#C55A11";
const FOREST = "#1F4D3A";
const SKY = "#0284C7";
const AMBER = "#D97706";

const PASS_TYPE_COLOR_MAP: Record<string, string> = {
  WRITTEN_PASS: AMBER,
  FINAL_PASS: FOREST,
  APPOINTED: SKY,
  WRITTEN_FAIL: "#94A3B8",
  FINAL_FAIL: "#EF4444",
};

// ─── chart surface ────────────────────────────────────────────────────────────
function ChartSurface({
  className,
  fallbackText,
  children,
}: {
  className: string;
  fallbackText: string;
  children: (size: { width: number; height: number }) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const measure = () => {
      const width = Math.floor(node.clientWidth);
      const height = Math.floor(node.clientHeight);
      setSize((cur) => (cur.width === width && cur.height === height ? cur : { width, height }));
    };

    measure();
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const isReady = size.width > 0 && size.height > 0;

  return (
    <div ref={containerRef} className={className}>
      {isReady ? (
        children(size)
      ) : (
        <div className="flex h-full items-center justify-center rounded-[20px] border border-dashed border-ink/10 text-sm text-slate">
          {fallbackText}
        </div>
      )}
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  unit,
  colorClass,
}: {
  label: string;
  value: number | string;
  unit?: string;
  colorClass: string;
}) {
  return (
    <div className={`rounded-[20px] border p-5 ${colorClass}`}>
      <p className="text-xs font-semibold">{label}</p>
      <p className="mt-1 text-3xl font-bold">
        {value}
        {unit ? <span className="ml-1 text-sm font-normal">{unit}</span> : null}
      </p>
    </div>
  );
}

// ─── props ────────────────────────────────────────────────────────────────────
type Props = {
  data: GraduateBenchmarkData;
};

export function BenchmarkClient({ data }: Props) {
  const {
    totalGraduates,
    writtenPassCount,
    finalPassCount,
    appointedCount,
    avgEnrolledMonths,
    medianEnrolledMonths,
    subjectAverages,
    monthlyPassCounts,
    enrolledMonthsDistribution,
    passTypeBreakdown,
    durationBrackets,
    recentGraduates,
  } = data;

  // ── Section 2: Monthly pass counts — build unified series ──────────────────
  const monthKeys = Array.from(
    new Set(monthlyPassCounts.map((r) => `${r.year}-${String(r.month).padStart(2, "0")}`))
  ).sort();

  const passTypesInData = Array.from(new Set(monthlyPassCounts.map((r) => r.passType)));

  const monthlyChartData = monthKeys.map((key) => {
    const row: Record<string, string | number> = { month: key };
    for (const pt of passTypesInData) {
      const entry = monthlyPassCounts.find(
        (r) => `${r.year}-${String(r.month).padStart(2, "0")}` === key && r.passType === pt
      );
      row[pt] = entry?.count ?? 0;
    }
    return row;
  });

  // ── Section 3: Subject averages — horizontal bar ───────────────────────────
  const subjectChartData = Object.entries(subjectAverages)
    .map(([subject, avg]) => ({
      subject,
      label: SUBJECT_LABEL[subject as Subject] ?? subject,
      avg,
    }))
    .sort((a, b) => b.avg - a.avg);

  // ── Section 1: Duration distribution ─────────────────────────────────────
  const durationData = enrolledMonthsDistribution;

  // ── PassType breakdown bar chart data ─────────────────────────────────────
  const passTypeChartData = passTypeBreakdown.map((pt) => ({
    label: pt.label,
    count: pt.count,
    pct: pt.pct,
  }));

  return (
    <div className="space-y-6">

      {/* ── 상담 활용 안내 카드 ────────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-forest/20 bg-forest/5 p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 rounded-full bg-forest/10 p-2.5">
            <svg className="h-5 w-5 text-forest" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-forest">상담 활용 가이드</h2>
            <p className="mt-1.5 text-sm leading-6 text-forest/80">
              이 페이지의 데이터는 실제 합격자 기록을 기반으로 산출됩니다. 신규 상담 시 아래 기준점을 참고하여 수강 기간과 목표 점수를 안내하세요.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-forest/70">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 font-bold">•</span>
                <span>
                  <strong className="text-forest">평균 수강 기간 {avgEnrolledMonths}개월</strong>을 기준으로 수강 계획을 제안하되, 중앙값 {medianEnrolledMonths}개월도 함께 안내합니다.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 font-bold">•</span>
                <span>
                  과목별 합격자 평균 점수를 목표 점수 기준으로 제시하고, 현재 모의고사 성적과 비교해 취약 과목을 파악합니다.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 font-bold">•</span>
                <span>
                  수강 기간 분포에서 전체 합격자의 다수 구간을 확인해, 학생의 목표 시험 일정과 역산한 등록 시점을 제안합니다.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── KPI cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="전체 합격자"
          value={totalGraduates}
          unit="명"
          colorClass="border-ink/10 bg-white text-ink"
        />
        <KpiCard
          label="필기합격"
          value={writtenPassCount}
          unit="명"
          colorClass="bg-sky-50 text-sky-700 border-sky-200"
        />
        <KpiCard
          label="최종합격"
          value={finalPassCount}
          unit="명"
          colorClass="bg-forest/10 text-forest border-forest/20"
        />
        <KpiCard
          label="임용"
          value={appointedCount}
          unit="명"
          colorClass="bg-amber-50 text-amber-700 border-amber-200"
        />
      </div>

      {/* ── avg / median supplemental cards ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard
          label="평균 수강 기간"
          value={avgEnrolledMonths}
          unit="개월"
          colorClass="border-ink/10 bg-white text-ink"
        />
        <KpiCard
          label="중간값 수강 기간"
          value={medianEnrolledMonths}
          unit="개월"
          colorClass="border-ink/10 bg-white text-ink"
        />
      </div>

      {/* ── Section: 합격 유형별 분포 (상담용) ───────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">합격 유형별 분포</h2>
            <p className="mt-1 text-sm text-slate">유형별 인원 비율 및 평균 수강 기간</p>
          </div>
          <span className="inline-flex rounded-full border border-ember/20 bg-ember/5 px-3 py-1 text-xs font-semibold text-ember">
            상담 참고자료
          </span>
        </div>
        {passTypeBreakdown.length === 0 ? (
          <div className="mt-6 flex h-32 items-center justify-center rounded-[20px] border border-dashed border-ink/10 text-sm text-slate">
            데이터가 없습니다.
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {passTypeBreakdown.map((pt) => (
                <div
                  key={pt.passType}
                  className={`rounded-[20px] border p-4 ${
                    pt.passType === PassType.WRITTEN_PASS
                      ? "border-sky-200 bg-sky-50"
                      : pt.passType === PassType.FINAL_PASS
                        ? "border-forest/20 bg-forest/5"
                        : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <p
                    className={`text-xs font-semibold ${
                      pt.passType === PassType.WRITTEN_PASS
                        ? "text-sky-700"
                        : pt.passType === PassType.FINAL_PASS
                          ? "text-forest"
                          : "text-amber-700"
                    }`}
                  >
                    {pt.label}
                  </p>
                  <p
                    className={`mt-1.5 text-3xl font-bold ${
                      pt.passType === PassType.WRITTEN_PASS
                        ? "text-sky-700"
                        : pt.passType === PassType.FINAL_PASS
                          ? "text-forest"
                          : "text-amber-700"
                    }`}
                  >
                    {pt.count}
                    <span className="ml-1 text-sm font-normal">명</span>
                  </p>
                  <div className="mt-3 space-y-1.5 text-xs text-slate">
                    <div className="flex items-center justify-between">
                      <span>비율</span>
                      <span className="font-semibold text-ink">{pt.pct}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>평균 수강</span>
                      <span className="font-semibold text-ink">{pt.avgEnrolledMonths}개월</span>
                    </div>
                  </div>
                  {/* 비율 막대 */}
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
                    <div
                      className={`h-full rounded-full ${
                        pt.passType === PassType.WRITTEN_PASS
                          ? "bg-sky-500"
                          : pt.passType === PassType.FINAL_PASS
                            ? "bg-forest"
                            : "bg-amber-500"
                      }`}
                      style={{ width: `${Math.min(pt.pct, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* bar chart for passType breakdown */}
            {passTypeChartData.length > 0 && (
              <ChartSurface className="mt-5 h-44" fallbackText="차트를 불러오는 중입니다.">
                {({ width, height }) => (
                  <BarChart
                    width={width}
                    height={height}
                    data={passTypeChartData}
                    margin={{ top: 8, right: 24, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#D6DCE5" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value, name) =>
                        name === "count" ? [`${value}명`, "인원"] : [`${value}%`, "비율"]
                      }
                    />
                    <Bar dataKey="count" name="count" radius={[6, 6, 0, 0]}>
                      {passTypeChartData.map((entry, index) => (
                        <Cell
                          key={`cell-pt-${index}`}
                          fill={
                            entry.label === "필기합격"
                              ? AMBER
                              : entry.label === "최종합격"
                                ? FOREST
                                : SKY
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ChartSurface>
            )}
          </>
        )}
      </div>

      {/* ── Section: 수강 기간 구간별 분포 (상담용) ──────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">수강 기간 구간 분포</h2>
            <p className="mt-1 text-sm text-slate">합격자의 수강 기간 분포 — 상담 시 목표 기간 제안에 활용</p>
          </div>
          <span className="inline-flex rounded-full border border-ember/20 bg-ember/5 px-3 py-1 text-xs font-semibold text-ember">
            상담 참고자료
          </span>
        </div>
        {durationBrackets.every((b) => b.count === 0) ? (
          <div className="mt-6 flex h-32 items-center justify-center rounded-[20px] border border-dashed border-ink/10 text-sm text-slate">
            수강 기간 데이터가 없습니다.
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {durationBrackets.map((bracket, i) => {
              const COLORS = ["bg-sky-500", "bg-forest", EMBER, "bg-amber-500"];
              const BORDER_COLORS = ["border-sky-200 bg-sky-50", "border-forest/20 bg-forest/5", "border-ember/20 bg-ember/5", "border-amber-200 bg-amber-50"];
              const TEXT_COLORS = ["text-sky-700", "text-forest", "text-ember", "text-amber-700"];
              return (
                <div key={bracket.label} className={`rounded-[20px] border p-4 ${BORDER_COLORS[i] ?? "border-ink/10 bg-white"}`}>
                  <p className={`text-xs font-semibold ${TEXT_COLORS[i] ?? "text-ink"}`}>{bracket.label}</p>
                  <p className={`mt-1.5 text-2xl font-bold ${TEXT_COLORS[i] ?? "text-ink"}`}>
                    {bracket.count}
                    <span className="ml-1 text-sm font-normal">명</span>
                  </p>
                  <p className="mt-1 text-xs text-slate">{bracket.pct}% 비율</p>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
                    <div
                      className={`h-full rounded-full ${COLORS[i] ?? "bg-ink"}`}
                      style={{ width: `${Math.min(bracket.pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {/* 상담 팁 */}
        <div className="mt-4 rounded-[16px] border border-amber-100 bg-amber-50/60 px-4 py-3 text-xs leading-5 text-amber-800">
          <strong>상담 팁:</strong> 가장 많은 합격자가 속한 수강 기간 구간을 확인해, 학생의 목표 시험일로부터 역산한 수강 시작 시기를 제안하세요.
          단기 수강생의 합격 비율이 높다면 집중 단기반을, 장기 수강생이 많다면 종합반을 권장합니다.
        </div>
      </div>

      {/* ── Section 1: Duration distribution ─────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink">수강 기간 분포 (히스토그램)</h2>
        <p className="mt-1 text-sm text-slate">합격자의 등록 수강 기간 히스토그램</p>
        {durationData.every((d) => d.count === 0) ? (
          <div className="mt-6 flex h-48 items-center justify-center rounded-[20px] border border-dashed border-ink/10 text-sm text-slate">
            데이터가 없습니다.
          </div>
        ) : (
          <ChartSurface className="mt-6 h-56" fallbackText="차트를 불러오는 중입니다.">
            {({ width, height }) => (
              <BarChart
                width={width}
                height={height}
                data={durationData}
                margin={{ top: 16, right: 24, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#D6DCE5" />
                <XAxis dataKey="months" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="인원" fill={EMBER} radius={[6, 6, 0, 0]} />
              </BarChart>
            )}
          </ChartSurface>
        )}
      </div>

      {/* ── Section 2: Monthly pass trend ────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink">월별 합격자 추이</h2>
        <p className="mt-1 text-sm text-slate">등록 월 기준 합격 유형별 추이</p>
        {monthlyChartData.length === 0 ? (
          <div className="mt-6 flex h-48 items-center justify-center rounded-[20px] border border-dashed border-ink/10 text-sm text-slate">
            데이터가 없습니다.
          </div>
        ) : (
          <ChartSurface className="mt-6 h-64" fallbackText="차트를 불러오는 중입니다.">
            {({ width, height }) => (
              <LineChart
                width={width}
                height={height}
                data={monthlyChartData}
                margin={{ top: 16, right: 24, left: 0, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#D6DCE5" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} minTickGap={20} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {passTypesInData.map((pt) => (
                  <Line
                    key={pt}
                    type="monotone"
                    dataKey={pt}
                    name={PASS_TYPE_LABEL[pt as PassType] ?? pt}
                    stroke={PASS_TYPE_COLOR_MAP[pt] ?? "#94A3B8"}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            )}
          </ChartSurface>
        )}
      </div>

      {/* ── Section 3: Subject averages ───────────────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">과목별 평균 성적 (합격자)</h2>
            <p className="mt-1 text-sm text-slate">합격 시점 스냅샷 기준 과목별 평균 점수</p>
          </div>
          <span className="inline-flex rounded-full border border-ember/20 bg-ember/5 px-3 py-1 text-xs font-semibold text-ember">
            상담 참고자료
          </span>
        </div>
        {subjectChartData.length === 0 ? (
          <div className="mt-6 flex h-48 items-center justify-center rounded-[20px] border border-dashed border-ink/10 text-sm text-slate">
            성적 스냅샷 데이터가 없습니다.
          </div>
        ) : (
          <>
            <ChartSurface className="mt-6 h-56" fallbackText="차트를 불러오는 중입니다.">
              {({ width, height }) => (
                <BarChart
                  layout="vertical"
                  width={width}
                  height={height}
                  data={subjectChartData}
                  margin={{ top: 8, right: 32, left: 16, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#D6DCE5" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
                  <YAxis dataKey="label" type="category" width={90} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => [typeof value === "number" ? `${value.toFixed(1)}점` : value, "평균"]} />
                  <Bar dataKey="avg" name="평균 점수" radius={[0, 6, 6, 0]}>
                    {subjectChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={index === 0 ? EMBER : index === 1 ? FOREST : "#60A5FA"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ChartSurface>

            {/* passType별 과목 비교 */}
            {passTypeBreakdown.filter((pt) => Object.keys(pt.subjectAverages).length > 0).length > 1 && (
              <div className="mt-5 overflow-x-auto">
                <p className="mb-3 text-sm font-semibold text-ink">합격 유형별 과목 평균 비교</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                      <th className="pb-2 pr-4 whitespace-nowrap">과목</th>
                      {passTypeBreakdown.filter((pt) => Object.keys(pt.subjectAverages).length > 0).map((pt) => (
                        <th key={pt.passType} className="pb-2 pr-4 whitespace-nowrap">{pt.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {subjectChartData.map((s) => (
                      <tr key={s.subject} className="hover:bg-mist/40">
                        <td className="py-2 pr-4 font-medium text-ink whitespace-nowrap">{s.label}</td>
                        {passTypeBreakdown.filter((pt) => Object.keys(pt.subjectAverages).length > 0).map((pt) => {
                          const val = pt.subjectAverages[s.subject];
                          return (
                            <td key={pt.passType} className="py-2 pr-4 text-slate whitespace-nowrap">
                              {typeof val === "number" ? (
                                <span className="font-semibold text-ink">{val.toFixed(1)}점</span>
                              ) : (
                                "-"
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Section 4: Recent graduates table ───────────────────────────── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="text-lg font-semibold text-ink">합격자 목록 (최근 20명)</h2>
        <div className="mt-4 overflow-x-auto">
          {recentGraduates.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate">등록된 합격자가 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                  <th className="pb-3 pr-4">이름</th>
                  <th className="pb-3 pr-4">시험명</th>
                  <th className="pb-3 pr-4">합격유형</th>
                  <th className="pb-3 pr-4">수강기간</th>
                  <th className="pb-3">합격일</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {recentGraduates.map((g) => (
                  <tr key={g.id} className="hover:bg-mist/50">
                    <td className="py-3 pr-4">
                      <Link
                        href={`/admin/graduates/${g.id}`}
                        className="font-medium text-ink hover:text-ember hover:underline"
                      >
                        {g.name}
                      </Link>
                      <span className="ml-2 text-xs text-slate">{g.examNumber}</span>
                    </td>
                    <td className="py-3 pr-4 text-slate">{g.examName}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          g.passType === PassType.WRITTEN_PASS
                            ? "border-sky-200 bg-sky-50 text-sky-700"
                            : g.passType === PassType.FINAL_PASS
                              ? "border-forest/20 bg-forest/10 text-forest"
                              : g.passType === PassType.APPOINTED
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-ink/10 bg-ink/5 text-slate"
                        }`}
                      >
                        {PASS_TYPE_LABEL[g.passType]}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-slate">
                      {g.enrolledMonths != null ? `${g.enrolledMonths}개월` : "-"}
                    </td>
                    <td className="py-3 text-slate">
                      {g.passDate ? g.passDate.slice(0, 10) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="mt-4 text-right">
          <Link
            href="/admin/graduates"
            className="text-sm font-medium text-ember hover:underline"
          >
            전체 합격자 목록 보기 →
          </Link>
        </div>
      </div>
    </div>
  );
}
