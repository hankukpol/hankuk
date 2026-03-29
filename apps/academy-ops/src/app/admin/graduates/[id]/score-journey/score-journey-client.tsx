"use client";

import type { ReactNode } from "react";
import { PassType } from "@prisma/client";
import type { ScoreJourneyData } from "./page";

// ── Constants ──────────────────────────────────────────────────────────────

const PASS_TYPE_LABEL: Record<PassType, string> = {
  WRITTEN_PASS: "필기합격",
  FINAL_PASS: "최종합격",
  APPOINTED: "임용",
  WRITTEN_FAIL: "필기불합격",
  FINAL_FAIL: "최종불합격",
};

const PASS_TYPE_COLOR: Record<PassType, string> = {
  WRITTEN_PASS: "bg-sky-50 text-sky-700 border-sky-200",
  FINAL_PASS: "bg-forest/10 text-forest border-forest/20",
  APPOINTED: "bg-amber-50 text-amber-700 border-amber-200",
  WRITTEN_FAIL: "bg-ink/5 text-slate border-ink/10",
  FINAL_FAIL: "bg-red-50 text-red-600 border-red-200",
};

const SUBJECT_LABEL: Record<string, string> = {
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINAL_LAW: "형법",
  CRIMINAL_PROCEDURE: "형사소송법",
  POLICE_SCIENCE: "경찰학",
  ENGLISH: "영어",
  KOREAN: "국어",
  MATHEMATICS: "수학",
  ADMINISTRATIVE_LAW: "행정법",
  GENERAL_KNOWLEDGE: "일반상식",
};

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function fmtMonth(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-[20px] border px-5 py-4 ${
        accent
          ? "border-ember/20 bg-ember/5"
          : "border-ink/10 bg-white"
      }`}
    >
      <p className="text-xs font-medium text-slate">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${accent ? "text-ember" : "text-ink"}`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-slate/70">{sub}</p>}
    </div>
  );
}

// ── SVG Line Chart ─────────────────────────────────────────────────────────

function LineChartSVG({
  data,
  milestones,
}: {
  data: Array<{ month: string; avg: number }>;
  milestones: Array<{ month: string; label: string; color: string }>;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-[20px] bg-mist/60 text-sm text-slate">
        월별 데이터 없음
      </div>
    );
  }

  const W = 700;
  const H = 220;
  const PAD_L = 40;
  const PAD_R = 20;
  const PAD_T = 20;
  const PAD_B = 40;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const minY = 30;
  const maxY = 100;
  const yRange = maxY - minY;

  const n = data.length;

  function xPos(i: number) {
    return PAD_L + (n === 1 ? chartW / 2 : (i / (n - 1)) * chartW);
  }
  function yPos(val: number) {
    return PAD_T + chartH - ((val - minY) / yRange) * chartH;
  }

  // Y grid lines
  const yTicks = [40, 50, 60, 70, 80, 90, 100];

  // Polyline path
  const pathD = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xPos(i).toFixed(1)} ${yPos(d.avg).toFixed(1)}`)
    .join(" ");

  // Milestone positions by month string
  const milestoneMap = new Map(milestones.map((m) => [m.month, m]));

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ minWidth: 320 }}
        aria-label="월별 성적 궤적 차트"
      >
        {/* Y grid */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD_L}
              y1={yPos(tick)}
              x2={W - PAD_R}
              y2={yPos(tick)}
              stroke="#E5E7EB"
              strokeWidth="1"
              strokeDasharray={tick === 80 ? "4 4" : undefined}
            />
            <text
              x={PAD_L - 6}
              y={yPos(tick) + 4}
              fontSize="10"
              fill="#4B5563"
              textAnchor="end"
            >
              {tick}
            </text>
            {tick === 80 && (
              <text
                x={W - PAD_R + 4}
                y={yPos(tick) + 4}
                fontSize="9"
                fill="#1F4D3A"
              >
                80
              </text>
            )}
          </g>
        ))}

        {/* 80-point reference line label */}
        <line
          x1={PAD_L}
          y1={yPos(80)}
          x2={W - PAD_R}
          y2={yPos(80)}
          stroke="#1F4D3A"
          strokeWidth="1"
          strokeDasharray="5 5"
          opacity="0.4"
        />

        {/* X labels */}
        {data.map((d, i) => {
          // Only render every other label if too many
          if (n > 10 && i % 2 !== 0) return null;
          return (
            <text
              key={i}
              x={xPos(i)}
              y={H - PAD_B + 16}
              fontSize="9"
              fill="#4B5563"
              textAnchor="middle"
            >
              {d.month.length >= 7 ? d.month.slice(2) : d.month}
            </text>
          );
        })}

        {/* Line */}
        <path d={pathD} fill="none" stroke="#C55A11" strokeWidth="2.5" strokeLinejoin="round" />

        {/* Dots + milestone markers */}
        {data.map((d, i) => {
          const ms = milestoneMap.get(d.month);
          return (
            <g key={i}>
              {ms ? (
                <>
                  <circle
                    cx={xPos(i)}
                    cy={yPos(d.avg)}
                    r={7}
                    fill={ms.color}
                    stroke="white"
                    strokeWidth="2"
                  />
                  <line
                    x1={xPos(i)}
                    y1={PAD_T}
                    x2={xPos(i)}
                    y2={H - PAD_B}
                    stroke={ms.color}
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    opacity="0.5"
                  />
                  <text
                    x={xPos(i)}
                    y={PAD_T - 6}
                    fontSize="9"
                    fill={ms.color}
                    textAnchor="middle"
                    fontWeight="600"
                  >
                    {ms.label}
                  </text>
                </>
              ) : (
                <circle
                  cx={xPos(i)}
                  cy={yPos(d.avg)}
                  r={4}
                  fill="#C55A11"
                  stroke="white"
                  strokeWidth="1.5"
                />
              )}
              {/* Score label on dot */}
              <text
                x={xPos(i)}
                y={yPos(d.avg) - 10}
                fontSize="9"
                fill="#111827"
                textAnchor="middle"
                fontWeight="500"
              >
                {d.avg}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Subject Improvement Bar Chart ──────────────────────────────────────────

function SubjectBars({
  firstSnapSubjects,
  finalSnapSubjects,
}: {
  firstSnapSubjects: Record<string, number>;
  finalSnapSubjects: Record<string, number>;
}) {
  const subjects = Array.from(
    new Set([...Object.keys(firstSnapSubjects), ...Object.keys(finalSnapSubjects)])
  ).sort();

  if (subjects.length === 0) return null;

  return (
    <div className="space-y-3">
      {subjects.map((sub) => {
        const initial = firstSnapSubjects[sub] ?? null;
        const final = finalSnapSubjects[sub] ?? null;
        const diff = initial != null && final != null ? round1(final - initial) : null;
        const isUp = diff != null && diff >= 0;
        const barWidth = Math.min(Math.max((final ?? 0) / 100, 0), 1) * 100;
        const initBarWidth = Math.min(Math.max((initial ?? 0) / 100, 0), 1) * 100;

        return (
          <div key={sub}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-ink">
                {SUBJECT_LABEL[sub] ?? sub}
              </span>
              <div className="flex items-center gap-3">
                {initial != null && (
                  <span className="text-xs text-slate">{initial}점 →</span>
                )}
                {final != null && (
                  <span className="text-sm font-bold text-ink">{final}점</span>
                )}
                {diff != null && (
                  <span
                    className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                      isUp
                        ? "bg-forest/10 text-forest"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    {isUp ? "+" : ""}
                    {diff}
                  </span>
                )}
              </div>
            </div>
            <div className="relative h-2 rounded-full bg-ink/10 overflow-hidden">
              {/* Initial score bar (ghost) */}
              {initial != null && (
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-ink/20"
                  style={{ width: `${initBarWidth}%` }}
                />
              )}
              {/* Final score bar */}
              {final != null && (
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all ${
                    isUp ? "bg-forest" : "bg-red-400"
                  }`}
                  style={{ width: `${barWidth}%` }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

interface Props {
  data: ScoreJourneyData;
}

export function ScoreJourneyClient({ data }: Props) {
  const {
    examNumber,
    studentName,
    studentMobile,
    examName,
    passType,
    writtenPassDate,
    finalPassDate,
    appointedDate,
    enrolledMonths,
    scoreSnapshots,
  } = data;

  // Select primary snapshot (use the highest-level one: APPOINTED > FINAL_PASS > WRITTEN_PASS)
  const PRIORITY: PassType[] = ["APPOINTED", "FINAL_PASS", "WRITTEN_PASS"];
  const primarySnapshot =
    PRIORITY.reduce<(typeof scoreSnapshots)[0] | null>((acc, pt) => {
      if (acc) return acc;
      return scoreSnapshots.find((s) => s.snapshotType === pt) ?? null;
    }, null) ?? scoreSnapshots[0] ?? null;

  // First snapshot by creation time
  const firstSnapshot =
    scoreSnapshots.length > 1
      ? scoreSnapshots[0]
      : null;

  const hasData = scoreSnapshots.length > 0;

  // Monthly averages from primary snapshot
  const monthlyData = primarySnapshot?.monthlyAverages ?? [];

  // Build milestone markers
  const milestones: Array<{ month: string; label: string; color: string }> = [];

  if (monthlyData.length > 0) {
    // Start milestone — first month
    milestones.push({ month: monthlyData[0].month, label: "수강시작", color: "#4B5563" });
    // End milestone — last month
    if (monthlyData.length > 1) {
      const lastMonth = monthlyData[monthlyData.length - 1].month;
      const passLabel =
        passType === "APPOINTED"
          ? "임용"
          : passType === "FINAL_PASS"
          ? "최종합격"
          : "필기합격";
      milestones.push({ month: lastMonth, label: passLabel, color: "#1F4D3A" });
    }
    // Written pass marker if different
    if (writtenPassDate && finalPassDate) {
      const wpMonth = fmtMonth(writtenPassDate).replace(".", "-");
      // Convert to the month key format used in monthlyAverages
      // monthlyAverages use "YYYY-MM" or similar format
      // Try to find the matching entry
      const wpKey = writtenPassDate.slice(0, 7); // "YYYY-MM"
      const wpEntry = monthlyData.find((d) => d.month === wpKey || d.month.startsWith(wpMonth));
      if (wpEntry) {
        milestones.push({ month: wpEntry.month, label: "필기합격", color: "#0369a1" });
      }
    }
  }

  // Pass date display
  const passDateStr =
    appointedDate
      ? fmtDate(appointedDate)
      : finalPassDate
      ? fmtDate(finalPassDate)
      : writtenPassDate
      ? fmtDate(writtenPassDate)
      : "-";

  // Subject comparison: first vs primary snapshot subjects
  const initialSubjects =
    firstSnapshot?.subjectAverages ?? primarySnapshot?.subjectAverages ?? {};
  const finalSubjects = primarySnapshot?.subjectAverages ?? {};

  // Total exam count from raw score history
  const totalExamCount = data.scoreHistory.length;

  // Avg attendance from primary snapshot
  const avgAttendance = primarySnapshot?.attendanceRate;

  // Score trend summary
  const startAvg =
    firstSnapshot?.first3MonthsAvg ??
    primarySnapshot?.first3MonthsAvg ??
    monthlyData[0]?.avg ??
    null;
  const finalAvg =
    primarySnapshot?.finalMonthAverage ??
    monthlyData[monthlyData.length - 1]?.avg ??
    null;

  // Counseling note text
  const counselingNote = (() => {
    const parts: string[] = [];
    parts.push(`${studentName} 학생은`);
    if (enrolledMonths != null) parts.push(`${enrolledMonths}개월 수강 후`);
    parts.push(PASS_TYPE_LABEL[passType]);
    if (startAvg != null) parts.push(`초기 평균 ${startAvg}점에서 시작하여`);
    if (finalAvg != null) parts.push(`합격 시점 ${finalAvg}점 달성`);
    if (avgAttendance != null) parts.push(`출석률 ${avgAttendance}%`);
    return parts.join(", ") + ".";
  })();

  return (
    <div className="mt-8 space-y-6">
      {/* ── 합격자 기본 정보 헤더 카드 ── */}
      <div className="rounded-[28px] border border-ink/10 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold">합격자 기본 정보</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <InfoItem
            label="학번"
            value={
              <a
                href={`/admin/students/${examNumber}`}
                className="font-medium text-forest hover:underline"
              >
                {examNumber}
              </a>
            }
          />
          <InfoItem label="이름" value={studentName} />
          <InfoItem label="연락처" value={studentMobile ?? "-"} />
          <InfoItem
            label="합격 구분"
            value={
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${PASS_TYPE_COLOR[passType]}`}
              >
                {PASS_TYPE_LABEL[passType]}
              </span>
            }
          />
          <InfoItem label="합격일" value={passDateStr} />
          {writtenPassDate && <InfoItem label="필기합격일" value={fmtDate(writtenPassDate)} />}
          {finalPassDate && <InfoItem label="최종합격일" value={fmtDate(finalPassDate)} />}
          {appointedDate && <InfoItem label="임용일" value={fmtDate(appointedDate)} />}
          <InfoItem
            label="수강 기간"
            value={enrolledMonths != null ? `${enrolledMonths}개월` : "-"}
          />
          <InfoItem label="시험명" value={examName} />
        </div>
      </div>

      {!hasData ? (
        /* ── 데이터 없음 메시지 ── */
        <div className="rounded-[28px] border border-ink/10 bg-white p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-mist">
            <svg
              className="h-8 w-8 text-slate"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <p className="text-base font-medium text-ink">성적 데이터가 없습니다</p>
          <p className="mt-2 text-sm text-slate">
            수강 이력이 연결된 합격자만 성적 궤적을 볼 수 있습니다.
          </p>
          <p className="mt-1 text-xs text-slate/70">
            합격자 상세 페이지에서 성적 스냅샷을 먼저 생성해 주세요.
          </p>
        </div>
      ) : (
        <>
          {/* ── 통계 카드 ── */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard
              label="수강 기간"
              value={enrolledMonths != null ? `${enrolledMonths}개월` : "-"}
              sub="수강 시작 ~ 합격"
              accent
            />
            <StatCard
              label="점수 변화"
              value={
                startAvg != null && finalAvg != null
                  ? `${startAvg} → ${finalAvg}`
                  : startAvg != null
                  ? `${startAvg}점`
                  : finalAvg != null
                  ? `${finalAvg}점`
                  : "-"
              }
              sub={
                startAvg != null && finalAvg != null
                  ? `${finalAvg - startAvg >= 0 ? "+" : ""}${round1(finalAvg - startAvg)}점 변화`
                  : "시작점 → 합격 시점"
              }
            />
            <StatCard
              label="총 응시 회차"
              value={totalExamCount > 0 ? `${totalExamCount}회` : "-"}
              sub="전체 수강 기간"
            />
            <StatCard
              label="평균 출석률"
              value={avgAttendance != null ? `${avgAttendance}%` : "-"}
              sub="수강 기간 전체"
            />
          </div>

          {/* ── 성적 궤적 차트 ── */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-base font-semibold">월별 성적 궤적</h2>
              <span className="rounded-full border border-ink/10 bg-mist/60 px-3 py-1 text-xs text-slate">
                {primarySnapshot
                  ? `${PASS_TYPE_LABEL[primarySnapshot.snapshotType]} 기준`
                  : ""}
              </span>
            </div>
            <p className="mb-4 text-xs text-slate/70">
              수강 기간 동안의 월별 평균 점수 추이 · 점선: 80점 기준선
            </p>

            {monthlyData.length === 0 ? (
              <div className="flex h-48 items-center justify-center rounded-[20px] bg-mist/60 text-sm text-slate">
                월별 데이터가 없습니다
              </div>
            ) : (
              <LineChartSVG data={monthlyData} milestones={milestones} />
            )}

            {/* Snapshot tabs if multiple */}
            {scoreSnapshots.length > 1 && (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-ink/10 pt-4">
                <p className="w-full text-xs text-slate mb-1">스냅샷 유형</p>
                {scoreSnapshots.map((s) => (
                  <span
                    key={s.id}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      s.id === primarySnapshot?.id
                        ? "border-ink bg-ink text-white"
                        : "border-ink/20 text-slate"
                    }`}
                  >
                    {PASS_TYPE_LABEL[s.snapshotType]}
                    {s.id === primarySnapshot?.id && " (기준)"}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── 과목별 성적 비교 ── */}
          <div className="rounded-[28px] border border-ink/10 bg-white p-6">
            <h2 className="mb-1 text-base font-semibold">과목별 성적 비교</h2>
            <p className="mb-5 text-xs text-slate/70">
              초기 성적(회색) vs 합격 시점 성적(컬러) ·{" "}
              <span className="text-forest font-medium">상승</span> /{" "}
              <span className="text-red-500 font-medium">하락</span>
            </p>

            {Object.keys(finalSubjects).length === 0 ? (
              <div className="rounded-[16px] bg-mist/60 py-6 text-center text-sm text-slate">
                과목별 데이터가 없습니다
              </div>
            ) : (
              <SubjectBars
                firstSnapSubjects={initialSubjects}
                finalSnapSubjects={finalSubjects}
              />
            )}
          </div>

          {/* ── 스냅샷별 상세 ── */}
          {scoreSnapshots.length > 0 && (
            <div className="rounded-[28px] border border-ink/10 bg-white p-6">
              <h2 className="mb-4 text-base font-semibold">스냅샷별 KPI 비교</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink/10">
                      <th className="pb-2 text-left text-xs font-medium text-slate">구분</th>
                      <th className="pb-2 text-right text-xs font-medium text-slate">수강 기간</th>
                      <th className="pb-2 text-right text-xs font-medium text-slate">전체 평균</th>
                      <th className="pb-2 text-right text-xs font-medium text-slate">초기 3개월</th>
                      <th className="pb-2 text-right text-xs font-medium text-slate">후기 3개월</th>
                      <th className="pb-2 text-right text-xs font-medium text-slate">출석률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoreSnapshots.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-ink/5 last:border-0"
                      >
                        <td className="py-2.5">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium ${PASS_TYPE_COLOR[s.snapshotType]}`}
                          >
                            {PASS_TYPE_LABEL[s.snapshotType]}
                          </span>
                        </td>
                        <td className="py-2.5 text-right text-ink">
                          {s.totalEnrolledMonths}개월
                        </td>
                        <td className="py-2.5 text-right font-semibold text-ink">
                          {s.overallAverage != null ? `${s.overallAverage}점` : "-"}
                        </td>
                        <td className="py-2.5 text-right text-slate">
                          {s.first3MonthsAvg != null ? `${s.first3MonthsAvg}점` : "-"}
                        </td>
                        <td className="py-2.5 text-right text-slate">
                          {s.last3MonthsAvg != null ? `${s.last3MonthsAvg}점` : "-"}
                        </td>
                        <td className="py-2.5 text-right text-slate">
                          {s.attendanceRate != null ? `${s.attendanceRate}%` : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── 상담 활용 노트 ── */}
          <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-6">
            <div className="mb-3 flex items-center gap-2">
              <svg
                className="h-5 w-5 text-amber-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h2 className="text-sm font-semibold text-amber-800">상담 활용 노트</h2>
            </div>
            <p className="text-sm leading-relaxed text-amber-900">{counselingNote}</p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <CounselingBadge
                label="수강 기간"
                value={enrolledMonths != null ? `${enrolledMonths}개월` : "-"}
              />
              <CounselingBadge
                label="시작 평균"
                value={startAvg != null ? `${startAvg}점` : "-"}
              />
              <CounselingBadge
                label="합격 시점 평균"
                value={finalAvg != null ? `${finalAvg}점` : "-"}
              />
              <CounselingBadge
                label="출석률"
                value={avgAttendance != null ? `${avgAttendance}%` : "-"}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Small helpers ───────────────────────────────────────────────────────────

function InfoItem({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-medium text-slate">{label}</p>
      <p className="text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

function CounselingBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-amber-200 bg-white/70 px-4 py-3 text-center">
      <p className="text-xs text-amber-700">{label}</p>
      <p className="mt-0.5 text-base font-bold text-amber-900">{value}</p>
    </div>
  );
}
