import Link from "next/link";
import { AdminRole, AttendType } from "@prisma/client";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";
import { getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { requireAdminContext } from "@/lib/auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";
import {
  buildExamSubjectLabelMap,
  buildFallbackExamSubjectCatalog,
  listExamSubjectCatalogForAcademy,
} from "@/lib/exam-subjects/service";
import { getPrisma } from "@/lib/prisma";
import { applyScoreSessionAcademyScope } from "@/lib/scores/session-admin";
import { getScoreSubjectLabel } from "@/lib/scores/subject-filter";
import { SessionSelector } from "./session-selector";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SessionStats = {
  sessionId: number;
  examDate: Date;
  subjectLabel: string;
  examTypeLabel: string;
  periodName: string;
  week: number;
  count: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  stdDev: number | null;
  atRiskCount: number;
  passRate60: number | null;
  passRate70: number | null;
  passRate80: number | null;
  dist0_39: number;
  dist40_59: number;
  dist60_79: number;
  dist80plus: number;
};

function computeStats(scores: number[]) {
  if (scores.length === 0) {
    return { avg: null, min: null, max: null, stdDev: null };
  }

  const avg = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const variance = scores.reduce((sum, value) => sum + (value - avg) ** 2, 0) / scores.length;

  return {
    avg: Math.round(avg * 10) / 10,
    min,
    max,
    stdDev: Math.round(Math.sqrt(variance) * 10) / 10,
  };
}

function fmt1(value: number | null): string {
  return value === null ? "-" : String(value);
}

function pct(count: number, total: number): string {
  if (total === 0) return "-";
  return `${(Math.round((count / total) * 1000) / 10).toFixed(1)}%`;
}

function formatSessionDate(date: Date): string {
  return format(date, "MM/dd(E)", { locale: ko });
}

function buildCsv(stats: SessionStats[]): string {
  const headers = [
    "세션ID",
    "시험일",
    "과목",
    "직렬",
    "기간",
    "주차",
    "응시자수",
    "평균",
    "최저",
    "최고",
    "표준편차",
    "위험자수(40미만)",
    "60점 이상",
    "70점 이상",
    "80점 이상",
    "0-39",
    "40-59",
    "60-79",
    "80+",
  ];

  const rows = stats.map((stat) =>
    [
      stat.sessionId,
      format(stat.examDate, "yyyy-MM-dd"),
      stat.subjectLabel,
      stat.examTypeLabel,
      stat.periodName,
      stat.week,
      stat.count,
      stat.avg ?? "",
      stat.min ?? "",
      stat.max ?? "",
      stat.stdDev ?? "",
      stat.atRiskCount,
      stat.passRate60 ?? "",
      stat.passRate70 ?? "",
      stat.passRate80 ?? "",
      stat.dist0_39,
      stat.dist40_59,
      stat.dist60_79,
      stat.dist80plus,
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

export default async function AggregateComparisonPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const sp = await searchParams;
  const sessionsParam = typeof sp.sessions === "string" ? sp.sessions.trim() : "";
  const examTypeFilter = typeof sp.examType === "string" ? sp.examType.trim() : "";

  const scope = await getAdminAcademyScope();
  const academyId = resolveVisibleAcademyId(scope);
  const prisma = getPrisma();
  const [allSessions, subjectCatalog] = await Promise.all([
    prisma.examSession.findMany({
      where: applyScoreSessionAcademyScope({ isCancelled: false }, academyId),
      orderBy: [{ examDate: "desc" }, { id: "desc" }],
      take: 200,
      select: {
        id: true,
        examType: true,
        subject: true,
        displaySubjectName: true,
        examDate: true,
        week: true,
        period: { select: { id: true, name: true } },
        _count: { select: { scores: true } },
      },
    }),
    academyId === null
      ? Promise.resolve(buildFallbackExamSubjectCatalog())
      : listExamSubjectCatalogForAcademy(academyId, { includeInactive: true }),
  ]);
  const subjectLabelMap = buildExamSubjectLabelMap(subjectCatalog);

  let selectedIds: number[] = [];
  if (sessionsParam) {
    selectedIds = sessionsParam
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value))
      .slice(0, 6);
  }

  if (selectedIds.length === 0) {
    const candidates = examTypeFilter
      ? allSessions.filter((session) => session.examType === examTypeFilter)
      : allSessions;
    selectedIds = candidates.slice(0, 6).map((session) => session.id);
  }

  const sessionDataList = await Promise.all(
    selectedIds.map(async (sessionId) => {
      const sessionInfo = await prisma.examSession.findFirst({
        where: applyScoreSessionAcademyScope({ id: sessionId }, academyId),
        select: {
          id: true,
          examType: true,
          subject: true,
          displaySubjectName: true,
          examDate: true,
          week: true,
          isCancelled: true,
          period: { select: { name: true } },
        },
      });

      if (!sessionInfo || sessionInfo.isCancelled) {
        return null;
      }

      const scores = await prisma.score.findMany({
        where: {
          sessionId: sessionInfo.id,
          attendType: { in: [AttendType.NORMAL, AttendType.LIVE] },
          finalScore: { not: null },
        },
        select: { finalScore: true },
      });

      const values = scores
        .map((score) => score.finalScore as number)
        .filter((value) => value !== null && value !== undefined);

      const { avg, min, max, stdDev } = computeStats(values);
      const atRiskCount = values.filter((value) => value < 40).length;
      const passCount60 = values.filter((value) => value >= 60).length;
      const passCount70 = values.filter((value) => value >= 70).length;
      const passCount80 = values.filter((value) => value >= 80).length;

      const stats: SessionStats = {
        sessionId: sessionInfo.id,
        examDate: sessionInfo.examDate,
        subjectLabel: getScoreSubjectLabel(
          sessionInfo.subject,
          sessionInfo.displaySubjectName,
          subjectLabelMap,
        ),
        examTypeLabel: EXAM_TYPE_LABEL[sessionInfo.examType] ?? sessionInfo.examType,
        periodName: sessionInfo.period.name,
        week: sessionInfo.week,
        count: values.length,
        avg,
        min,
        max,
        stdDev,
        atRiskCount,
        passRate60: values.length > 0 ? Math.round((passCount60 / values.length) * 1000) / 10 : null,
        passRate70: values.length > 0 ? Math.round((passCount70 / values.length) * 1000) / 10 : null,
        passRate80: values.length > 0 ? Math.round((passCount80 / values.length) * 1000) / 10 : null,
        dist0_39: values.filter((value) => value < 40).length,
        dist40_59: values.filter((value) => value >= 40 && value < 60).length,
        dist60_79: values.filter((value) => value >= 60 && value < 80).length,
        dist80plus: values.filter((value) => value >= 80).length,
      };

      return stats;
    }),
  );

  const stats = sessionDataList.filter((item): item is SessionStats => item !== null);
  const trendData = [...stats].sort((a, b) => a.examDate.getTime() - b.examDate.getTime());

  const svgWidth = 600;
  const svgHeight = 160;
  const padL = 40;
  const padR = 20;
  const padT = 16;
  const padB = 32;
  const chartW = svgWidth - padL - padR;
  const chartH = svgHeight - padT - padB;

  const trendAvgs = trendData.map((stat) => stat.avg);
  const validAvgs = trendAvgs.filter((value): value is number => value !== null);
  const trendMin = validAvgs.length > 0 ? Math.min(...validAvgs) : 0;
  const trendMax = validAvgs.length > 0 ? Math.max(...validAvgs) : 100;
  const yRange = trendMax - trendMin || 10;

  function toX(index: number): number {
    if (trendData.length <= 1) return padL + chartW / 2;
    return padL + (index / (trendData.length - 1)) * chartW;
  }

  function toY(value: number): number {
    return padT + chartH - ((value - trendMin) / yRange) * chartH;
  }

  const points = trendData
    .map((stat, index) => (stat.avg !== null ? `${toX(index)},${toY(stat.avg)}` : null))
    .filter(Boolean)
    .join(" ");

  const csvData = buildCsv(stats);
  const csvBase64 = Buffer.from("\uFEFF" + csvData).toString("base64");

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "성적 관리", href: "/admin/scores" },
          { label: "회차 목록", href: "/admin/scores/sessions" },
          { label: "회차 비교 분석" },
        ]}
      />

      <div className="mt-4">
        <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
          성적 분석
        </div>
        <h1 className="mt-3 text-3xl font-semibold">회차 비교 분석</h1>
        <p className="mt-2 text-sm text-slate">
          현재 지점의 최근 회차 최대 6개를 기준으로 평균, 분포, 합격 구간 비율을 비교합니다. 직렬 필터와 세션 선택을 함께 사용할 수 있습니다.
        </p>
      </div>

      <div className="mt-8">
        <SessionSelector
          allSessions={allSessions.map((session) => ({
            id: session.id,
            label: `${format(session.examDate, "MM/dd")} ${getScoreSubjectLabel(
              session.subject,
              session.displaySubjectName,
              subjectLabelMap,
            )} (${session.period.name})`,
            examType: session.examType,
            hasScores: session._count.scores > 0,
          }))}
          selectedIds={selectedIds}
          examTypeFilter={examTypeFilter}
        />
      </div>

      {stats.length === 0 ? (
        <div className="mt-10 rounded-[28px] border border-dashed border-ink/10 p-12 text-center text-sm text-slate">
          비교할 회차가 없습니다. 성적이 입력된 회차를 선택해 주세요.
        </div>
      ) : (
        <>
          <section className="mt-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate">지표 비교 ({stats.length}개 회차)</h2>
              <a
                href={`data:text/csv;charset=utf-8;base64,${csvBase64}`}
                download={`score-comparison-${format(new Date(), "yyyyMMdd")}.csv`}
                className="inline-flex items-center rounded-full border border-ink/20 px-4 py-2 text-xs font-semibold text-slate transition hover:border-ink/40 hover:text-ink"
              >
                CSV 다운로드
              </a>
            </div>

            <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-panel">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/60">
                    <th className="whitespace-nowrap px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">지표</th>
                    {stats.map((stat) => (
                      <th key={stat.sessionId} className="whitespace-nowrap px-4 py-4 text-center text-xs font-semibold text-ink">
                        <div className="font-semibold">{formatSessionDate(stat.examDate)}</div>
                        <div className="mt-0.5 max-w-[120px] truncate font-normal text-slate">{stat.subjectLabel}</div>
                        <div className="mt-0.5 text-[10px] text-slate/70">{stat.periodName}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  <MetricRow label="직렬" values={stats.map((stat) => stat.examTypeLabel)} />
                  <MetricRow label="주차" values={stats.map((stat) => `${stat.week}주차`)} />
                  <MetricRow label="응시자 수" values={stats.map((stat) => `${stat.count}명`)} />
                  <tr className="hover:bg-mist/40">
                    <td className="whitespace-nowrap px-5 py-3.5 text-xs font-semibold text-slate">평균 점수</td>
                    {stats.map((stat) => (
                      <td key={stat.sessionId} className="px-4 py-3.5 text-center">
                        <span className={`text-base font-bold ${stat.avg === null ? "text-slate" : stat.avg >= 70 ? "text-forest" : stat.avg >= 60 ? "text-amber-600" : "text-red-600"}`}>
                          {stat.avg !== null ? `${stat.avg}점` : "-"}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <MetricRow label="최저 점수" values={stats.map((stat) => (stat.min !== null ? `${stat.min}점` : "-"))} />
                  <MetricRow label="최고 점수" values={stats.map((stat) => (stat.max !== null ? `${stat.max}점` : "-"))} />
                  <MetricRow label="표준편차" values={stats.map((stat) => fmt1(stat.stdDev))} />
                  <tr className="bg-red-50/30 hover:bg-mist/40">
                    <td className="whitespace-nowrap px-5 py-3.5 text-xs font-semibold text-red-700">위험 점수(40점 미만)</td>
                    {stats.map((stat) => (
                      <td key={stat.sessionId} className="px-4 py-3.5 text-center">
                        <span className={`font-semibold ${stat.atRiskCount > 0 ? "text-red-600" : "text-slate"}`}>{stat.atRiskCount}명</span>
                        {stat.count > 0 && <span className="ml-1 text-xs text-slate">({pct(stat.atRiskCount, stat.count)})</span>}
                      </td>
                    ))}
                  </tr>
                  <tr className="hover:bg-mist/40">
                    <td className="whitespace-nowrap px-5 py-3.5 text-xs font-semibold text-slate">60점 이상</td>
                    {stats.map((stat) => (
                      <td key={stat.sessionId} className="px-4 py-3.5 text-center">
                        <span className={`font-semibold ${(stat.passRate60 ?? 0) >= 70 ? "text-forest" : "text-amber-600"}`}>{stat.passRate60 !== null ? `${stat.passRate60}%` : "-"}</span>
                      </td>
                    ))}
                  </tr>
                  <tr className="hover:bg-mist/40">
                    <td className="whitespace-nowrap px-5 py-3.5 text-xs font-semibold text-slate">70점 이상</td>
                    {stats.map((stat) => (
                      <td key={stat.sessionId} className="px-4 py-3.5 text-center">
                        <span className="font-semibold text-ink">{stat.passRate70 !== null ? `${stat.passRate70}%` : "-"}</span>
                      </td>
                    ))}
                  </tr>
                  <tr className="hover:bg-mist/40">
                    <td className="whitespace-nowrap px-5 py-3.5 text-xs font-semibold text-slate">80점 이상</td>
                    {stats.map((stat) => (
                      <td key={stat.sessionId} className="px-4 py-3.5 text-center">
                        <span className="font-semibold text-forest">{stat.passRate80 !== null ? `${stat.passRate80}%` : "-"}</span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">점수 분포</h2>
            <div className="overflow-x-auto rounded-[28px] border border-ink/10 bg-white shadow-panel">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-mist/60">
                    <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate">구간</th>
                    {stats.map((stat) => (
                      <th key={stat.sessionId} className="whitespace-nowrap px-4 py-4 text-center text-xs font-semibold text-ink">
                        {formatSessionDate(stat.examDate)}
                        <div className="text-[10px] font-normal text-slate">{stat.subjectLabel}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  <DistRow label="0~39" colorClass="text-red-600" values={stats.map((stat) => ({ count: stat.dist0_39, total: stat.count }))} />
                  <DistRow label="40~59" colorClass="text-amber-600" values={stats.map((stat) => ({ count: stat.dist40_59, total: stat.count }))} />
                  <DistRow label="60~79" colorClass="text-ink" values={stats.map((stat) => ({ count: stat.dist60_79, total: stat.count }))} />
                  <DistRow label="80+" colorClass="text-forest" values={stats.map((stat) => ({ count: stat.dist80plus, total: stat.count }))} />
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-10">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-slate">평균 점수 추이</h2>
            <div className="rounded-[28px] border border-ink/10 bg-white p-6 shadow-panel">
              {trendData.length < 2 ? (
                <p className="py-6 text-center text-sm text-slate">추이 차트는 2개 이상의 회차가 필요합니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full max-w-3xl" aria-label="평균 점수 추이 차트">
                    {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                      const y = padT + chartH * (1 - tick);
                      const value = trendMin + yRange * tick;
                      return (
                        <g key={tick}>
                          <line x1={padL} y1={y} x2={svgWidth - padR} y2={y} stroke="#e5e7eb" strokeWidth={1} />
                          <text x={padL - 4} y={y + 4} textAnchor="end" fontSize={10} fill="#6B7280">
                            {Math.round(value)}
                          </text>
                        </g>
                      );
                    })}
                    {trendData.map((stat, index) => (
                      <text key={stat.sessionId} x={toX(index)} y={svgHeight - 4} textAnchor="middle" fontSize={9} fill="#6B7280">
                        {format(stat.examDate, "MM/dd")}
                      </text>
                    ))}
                    {points && <polyline points={points} fill="none" stroke="#C55A11" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
                    {trendData.map((stat, index) =>
                      stat.avg !== null ? (
                        <g key={stat.sessionId}>
                          <circle cx={toX(index)} cy={toY(stat.avg)} r={5} fill="white" stroke="#C55A11" strokeWidth={2} />
                          <text x={toX(index)} y={toY(stat.avg) - 9} textAnchor="middle" fontSize={10} fontWeight="600" fill="#C55A11">
                            {stat.avg}
                          </text>
                        </g>
                      ) : null,
                    )}
                  </svg>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-3">
                {trendData.map((stat) => (
                  <Link
                    key={stat.sessionId}
                    href={`/admin/scores/sessions/${stat.sessionId}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-mist/60 px-3 py-1 text-xs font-medium text-slate transition hover:border-ember/30 hover:text-ember"
                  >
                    {formatSessionDate(stat.examDate)} {stat.subjectLabel}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MetricRow({ label, values }: { label: string; values: string[] }) {
  return (
    <tr className="hover:bg-mist/40">
      <td className="whitespace-nowrap px-5 py-3.5 text-xs font-semibold text-slate">{label}</td>
      {values.map((value, index) => (
        <td key={index} className="px-4 py-3.5 text-center text-sm text-ink">
          {value || "-"}
        </td>
      ))}
    </tr>
  );
}

function DistRow({
  label,
  colorClass,
  values,
}: {
  label: string;
  colorClass: string;
  values: Array<{ count: number; total: number }>;
}) {
  return (
    <tr className="hover:bg-mist/40">
      <td className={`whitespace-nowrap px-5 py-3.5 text-xs font-semibold ${colorClass}`}>{label}</td>
      {values.map((value, index) => (
        <td key={index} className="px-4 py-3.5 text-center text-sm">
          <span className={`font-semibold ${colorClass}`}>{value.count}명</span>
          {value.total > 0 && <span className="ml-1 text-xs text-slate">({pct(value.count, value.total)})</span>}
        </td>
      ))}
    </tr>
  );
}
