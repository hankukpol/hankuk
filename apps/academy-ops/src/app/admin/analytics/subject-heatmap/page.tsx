import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SUBJECT_LABEL } from "@/lib/constants";
import { HeatmapClient } from "./heatmap-client";

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

function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export default async function SubjectHeatmapPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const examTypeParam = readParam(searchParams, "examType") ?? "ALL";
  const weeksParam = readParam(searchParams, "weeks") ?? "12";
  const weeksBack = Math.min(parseInt(weeksParam, 10) || 12, 52);

  const prisma = getPrisma();

  // Calculate date range
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - weeksBack * 7);

  // Build examType filter
  const examTypeFilter: { examType?: "GONGCHAE" | "GYEONGCHAE" } =
    examTypeParam === "GONGCHAE" || examTypeParam === "GYEONGCHAE"
      ? { examType: examTypeParam }
      : {};

  // Fetch sessions in the date range
  const sessions = await prisma.examSession.findMany({
    where: {
      isCancelled: false,
      examDate: { gte: startDate, lte: now },
      ...examTypeFilter,
    },
    select: {
      id: true,
      subject: true,
      examDate: true,
    },
    orderBy: { examDate: "asc" },
  });

  const sessionIds = sessions.map((s) => s.id);

  // Fetch scores
  const scores =
    sessionIds.length > 0
      ? await prisma.score.findMany({
          where: {
            sessionId: { in: sessionIds },
            finalScore: { not: null },
            attendType: { not: "ABSENT" },
          },
          select: {
            sessionId: true,
            finalScore: true,
          },
        })
      : [];

  // Map sessionId -> { subject, weekKey }
  const sessionInfoMap = new Map<
    number,
    { subject: string; weekKey: string }
  >();
  for (const session of sessions) {
    sessionInfoMap.set(session.id, {
      subject: session.subject,
      weekKey: getWeekKey(session.examDate),
    });
  }

  // Aggregate: { subject+weekKey -> { sum, count } }
  const aggMap = new Map<string, { sum: number; count: number }>();
  for (const score of scores) {
    const info = sessionInfoMap.get(score.sessionId);
    if (!info || score.finalScore === null) continue;
    const key = `${info.subject}:::${info.weekKey}`;
    const prev = aggMap.get(key) ?? { sum: 0, count: 0 };
    aggMap.set(key, {
      sum: prev.sum + score.finalScore,
      count: prev.count + 1,
    });
  }

  // Collect unique weeks and subjects
  const weekSet = new Set<string>();
  const subjectSet = new Set<string>();
  for (const session of sessions) {
    weekSet.add(getWeekKey(session.examDate));
    subjectSet.add(session.subject);
  }

  const weeks = Array.from(weekSet).sort();
  const subjects = Array.from(subjectSet).sort();

  // Build data array
  const data: { subject: string; weekKey: string; avg: number; count: number }[] =
    [];
  for (const subject of subjects) {
    for (const weekKey of weeks) {
      const key = `${subject}:::${weekKey}`;
      const agg = aggMap.get(key);
      if (agg && agg.count > 0) {
        data.push({
          subject,
          weekKey,
          avg: Math.round((agg.sum / agg.count) * 10) / 10,
          count: agg.count,
        });
      }
    }
  }

  // Subject labels for display
  const subjectLabels: Record<string, string> = {};
  for (const subject of subjects) {
    subjectLabels[subject] =
      SUBJECT_LABEL[subject as keyof typeof SUBJECT_LABEL] ?? subject;
  }

  const examTypeOptions = [
    { value: "ALL", label: "전체 직렬" },
    { value: "GONGCHAE", label: "공채" },
    { value: "GYEONGCHAE", label: "경채" },
  ];

  const weeksOptions = [
    { value: "4", label: "최근 4주" },
    { value: "8", label: "최근 8주" },
    { value: "12", label: "최근 12주" },
    { value: "24", label: "최근 24주" },
  ];

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        Subject Heatmap
      </div>
      <h1 className="mt-5 text-3xl font-semibold">과목별 성적 히트맵</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        주차별 · 과목별 평균 점수를 색상으로 시각화합니다.
        빨간색 셀은 점수가 낮은 취약 구간, 초록색 셀은 성적이 높은 구간을 나타냅니다.
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
        <div className="min-w-[160px] flex-1">
          <label className="mb-2 block text-sm font-medium">조회 기간</label>
          <select
            name="weeks"
            defaultValue={weeksParam}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {weeksOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
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
          {(examTypeParam !== "ALL" || weeksParam !== "12") && (
            <Link
              href="/admin/analytics/subject-heatmap"
              className="inline-flex items-center rounded-full border border-ink/20 px-5 py-3 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
            >
              초기화
            </Link>
          )}
        </div>
      </form>

      {/* Heatmap Client Component */}
      <div className="mt-8">
        <HeatmapClient
          weeks={weeks}
          subjects={subjects}
          data={data}
          subjectLabels={subjectLabels}
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
          href="/admin/analytics/cohorts"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          기수별 분석 →
        </Link>
        <Link
          href="/admin/analytics/cohort-progression"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          기수 성적 추이 →
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
