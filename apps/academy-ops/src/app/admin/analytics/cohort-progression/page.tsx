import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SUBJECT_LABEL, EXAM_TYPE_LABEL } from "@/lib/constants";
import { ProgressionClient } from "./progression-client";
import type { ProgressionSeries, SessionRow } from "./progression-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(
  searchParams: PageProps["searchParams"],
  key: string,
): string | undefined {
  const v = searchParams?.[key];
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

export default async function CohortProgressionPage({
  searchParams,
}: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const examTypeParam = readParam(searchParams, "examType") ?? "ALL";
  const periodIdParam = readParam(searchParams, "periodId");

  const prisma = getPrisma();

  // Load available periods for the filter
  const periods = await prisma.examPeriod.findMany({
    orderBy: { startDate: "desc" },
    take: 20,
    select: {
      id: true,
      name: true,
      isActive: true,
      startDate: true,
    },
  });

  // Build filters
  const examTypeFilter: { examType?: "GONGCHAE" | "GYEONGCHAE" } =
    examTypeParam === "GONGCHAE" || examTypeParam === "GYEONGCHAE"
      ? { examType: examTypeParam }
      : {};

  const periodFilter = periodIdParam
    ? { periodId: parseInt(periodIdParam, 10) }
    : {};

  // Fetch exam sessions ordered by date
  const sessions = await prisma.examSession.findMany({
    where: {
      isCancelled: false,
      ...examTypeFilter,
      ...periodFilter,
    },
    select: {
      id: true,
      examDate: true,
      week: true,
      examType: true,
      subject: true,
    },
    orderBy: { examDate: "asc" },
    take: 500,
  });

  const sessionIds = sessions.map((s) => s.id);

  // Fetch all scores for these sessions
  const allScores =
    sessionIds.length > 0
      ? await prisma.score.findMany({
          where: {
            sessionId: { in: sessionIds },
            finalScore: { not: null },
            attendType: { not: "ABSENT" },
          },
          select: {
            sessionId: true,
            examNumber: true,
            finalScore: true,
          },
        })
      : [];

  // Build aggregation maps
  type WeekTypeKey = string; // "GONGCHAE:::5"
  const weekTypeAgg = new Map<WeekTypeKey, { sum: number; count: number }>();
  const sessionAvgMap = new Map<
    number,
    { avgByType: Record<string, { sum: number; count: number }> }
  >();

  const sessionMap = new Map(sessions.map((s) => [s.id, s]));

  for (const score of allScores) {
    const session = sessionMap.get(score.sessionId);
    if (!session || score.finalScore === null) continue;

    // Per-session stats
    const sessionEntry = sessionAvgMap.get(score.sessionId) ?? {
      avgByType: {},
    };
    const examType = session.examType;
    const et = sessionEntry.avgByType[examType] ?? { sum: 0, count: 0 };
    et.sum += score.finalScore;
    et.count += 1;
    sessionEntry.avgByType[examType] = et;
    sessionAvgMap.set(score.sessionId, sessionEntry);

    // Weekly aggregation
    const weekKey: WeekTypeKey = `${session.examType}:::${session.week}`;
    const prev = weekTypeAgg.get(weekKey) ?? { sum: 0, count: 0 };
    weekTypeAgg.set(weekKey, {
      sum: prev.sum + score.finalScore,
      count: prev.count + 1,
    });
  }

  // Determine which exam types to include
  const examTypes =
    examTypeParam === "ALL"
      ? (["GONGCHAE", "GYEONGCHAE"] as const)
      : ([examTypeParam] as const);

  // Build series
  const series: ProgressionSeries[] = examTypes
    .map((examType) => {
      const weekNums = [
        ...new Set(
          sessions
            .filter((s) => s.examType === examType)
            .map((s) => s.week),
        ),
      ].sort((a, b) => a - b);

      const points = weekNums
        .map((weekNum) => {
          const key: WeekTypeKey = `${examType}:::${weekNum}`;
          const agg = weekTypeAgg.get(key);
          if (!agg || agg.count === 0) return null;
          return {
            weekLabel: `${weekNum}주`,
            weekNum,
            avg: Math.round((agg.sum / agg.count) * 10) / 10,
            count: agg.count,
          };
        })
        .filter(
          (
            p,
          ): p is {
            weekLabel: string;
            weekNum: number;
            avg: number;
            count: number;
          } => p !== null,
        );

      const label = examType === "GONGCHAE" ? "공채" : "경채";

      return {
        id: examType,
        label,
        examType,
        points,
      };
    })
    .filter((s) => s.points.length > 0);

  // Build session rows
  const sessionRows: SessionRow[] = sessions.map((session) => {
    const avgMap = sessionAvgMap.get(session.id);
    const avgByType: Record<string, number> = {};
    if (avgMap) {
      for (const [et, agg] of Object.entries(avgMap.avgByType)) {
        if (agg.count > 0) {
          avgByType[et] = Math.round((agg.sum / agg.count) * 10) / 10;
        }
      }
    }
    return {
      id: session.id,
      examDate: session.examDate.toISOString(),
      week: session.week,
      subject: session.subject,
      examType: session.examType,
      avgByType,
    };
  });

  // Build label maps
  const subjectLabels: Record<string, string> = {};
  for (const s of sessions) {
    subjectLabels[s.subject] =
      SUBJECT_LABEL[s.subject as keyof typeof SUBJECT_LABEL] ?? s.subject;
  }

  const examTypeLabels: Record<string, string> = {
    GONGCHAE: EXAM_TYPE_LABEL.GONGCHAE,
    GYEONGCHAE: EXAM_TYPE_LABEL.GYEONGCHAE,
  };

  const examTypeOptions = [
    { value: "ALL", label: "전체 직렬" },
    { value: "GONGCHAE", label: "공채" },
    { value: "GYEONGCHAE", label: "경채" },
  ];

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        성적 추이
      </div>
      <h1 className="mt-5 text-3xl font-semibold">기수 성적 추이</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        주차별 평균 점수 변화를 꺾은선 차트로 표시합니다.
        공채·경채 직렬별로 비교하거나 특정 기간을 선택하여 분석할 수 있습니다.
      </p>

      {/* Filter Form */}
      <form
        method="get"
        className="mt-8 flex flex-wrap gap-4 rounded-[28px] border border-ink/10 bg-mist p-6"
      >
        <div className="min-w-[160px] flex-1">
          <label className="mb-2 block text-sm font-medium">시험 직렬</label>
          <select
            name="examType"
            defaultValue={examTypeParam}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {examTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="mb-2 block text-sm font-medium">기간 선택</label>
          <select
            name="periodId"
            defaultValue={periodIdParam ?? ""}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="">전체 기간</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isActive ? " (활성)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-3">
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
          {(examTypeParam !== "ALL" || periodIdParam) && (
            <Link
              href="/admin/analytics/cohort-progression"
              className="inline-flex items-center rounded-full border border-ink/20 px-5 py-3 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
            >
              초기화
            </Link>
          )}
        </div>
      </form>

      {/* Progression Client */}
      <div className="mt-8">
        <ProgressionClient
          series={series}
          sessions={sessionRows}
          subjectLabels={subjectLabels}
          examTypeLabels={examTypeLabels}
        />
      </div>

      {/* Navigation */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/analytics"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          ← 분석 허브
        </Link>
        <Link
          href="/admin/analytics/subject-heatmap"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          과목 히트맵 →
        </Link>
        <Link
          href="/admin/analytics/cohorts"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          기수 코호트 분석 →
        </Link>
        <Link
          href="/admin/reports/top-students"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          우수학생 보고서 →
        </Link>
      </div>
    </div>
  );
}
