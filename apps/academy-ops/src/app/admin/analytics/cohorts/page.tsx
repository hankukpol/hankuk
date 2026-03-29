import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";
import { CohortAnalysisClient, type CohortStatRow } from "./cohort-analysis-client";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readStringParam(
  searchParams: PageProps["searchParams"],
  key: string,
): string | undefined {
  const v = searchParams?.[key];
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

export default async function CohortComparisonPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const courseIdParam = readStringParam(searchParams, "courseId");
  const examTypeParam = readStringParam(searchParams, "examType"); // "ALL" | "GONGCHAE" | "GYEONGCHAE"

  const prisma = getPrisma();

  // Courses for filter dropdown
  const courses = await prisma.course.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 50,
  });

  // courseId filter: read course to get examCategory
  let examCategoryFilter: string | undefined;
  if (courseIdParam) {
    const course = await prisma.course.findUnique({
      where: { id: parseInt(courseIdParam, 10) },
      select: { examType: true },
    });
    if (course?.examType === "GONGCHAE") examCategoryFilter = "GONGCHAE";
    else if (course?.examType === "GYEONGCHAE") examCategoryFilter = "GYEONGCHAE";
  }

  // examType param overrides courseId filter
  if (examTypeParam && examTypeParam !== "ALL") {
    examCategoryFilter = examTypeParam;
  }

  const cohorts = await prisma.cohort.findMany({
    where: examCategoryFilter
      ? { examCategory: examCategoryFilter as never }
      : undefined,
    orderBy: { startDate: "desc" },
    take: 10,
    select: {
      id: true,
      name: true,
      examCategory: true,
      startDate: true,
      endDate: true,
    },
  });

  // Fetch enrollment stats per cohort
  const enrollmentGroups = await prisma.courseEnrollment.groupBy({
    by: ["cohortId", "status"],
    _count: { status: true },
    where: {
      cohortId: { in: cohorts.map((c) => c.id) },
    },
  });

  // Fetch payment totals per cohort
  const enrollmentRows = await prisma.courseEnrollment.findMany({
    where: { cohortId: { in: cohorts.map((c) => c.id) } },
    select: { id: true, cohortId: true, examNumber: true },
  });

  const enrollmentCohortMap = new Map<string, string>();
  for (const e of enrollmentRows) {
    if (e.cohortId) enrollmentCohortMap.set(e.id, e.cohortId);
  }

  const paymentAggData = await prisma.payment.findMany({
    where: {
      status: "APPROVED",
      enrollmentId: {
        in: enrollmentRows.map((r) => r.id),
      },
    },
    select: {
      netAmount: true,
      enrollmentId: true,
    },
  });

  // Revenue per cohort
  const revenueMap = new Map<string, number>();
  for (const p of paymentAggData) {
    if (!p.enrollmentId) continue;
    const cohortId = enrollmentCohortMap.get(p.enrollmentId);
    if (!cohortId) continue;
    revenueMap.set(cohortId, (revenueMap.get(cohortId) ?? 0) + p.netAmount);
  }

  // Map cohortId -> examNumbers
  const cohortExamNumbersMap = new Map<string, string[]>();
  for (const e of enrollmentRows) {
    if (!e.cohortId) continue;
    const arr = cohortExamNumbersMap.get(e.cohortId) ?? [];
    arr.push(e.examNumber);
    cohortExamNumbersMap.set(e.cohortId, arr);
  }

  // Attendance logs per cohort
  const attendanceMap = new Map<string, { present: number; total: number }>();
  for (const cohort of cohorts) {
    const examNumbers = cohortExamNumbersMap.get(cohort.id) ?? [];
    if (examNumbers.length === 0) {
      attendanceMap.set(cohort.id, { present: 0, total: 0 });
      continue;
    }
    const logs = await prisma.classroomAttendanceLog.groupBy({
      by: ["attendType"],
      _count: { attendType: true },
      where: {
        examNumber: { in: examNumbers },
        attendDate: {
          gte: cohort.startDate,
          lte: cohort.endDate,
        },
      },
    });
    const present = logs
      .filter((l) => l.attendType === "NORMAL" || l.attendType === "LIVE")
      .reduce((s, l) => s + l._count.attendType, 0);
    const total = logs.reduce((s, l) => s + l._count.attendType, 0);
    attendanceMap.set(cohort.id, { present, total });
  }

  // Scores per cohort
  const scoreMap = new Map<string, number | null>();
  for (const cohort of cohorts) {
    const examNumbers = cohortExamNumbersMap.get(cohort.id) ?? [];
    if (examNumbers.length === 0) {
      scoreMap.set(cohort.id, null);
      continue;
    }
    const result = await prisma.score.aggregate({
      _avg: { finalScore: true },
      where: {
        examNumber: { in: examNumbers },
        finalScore: { not: null },
        session: {
          examDate: {
            gte: cohort.startDate,
            lte: cohort.endDate,
          },
        },
      },
    });
    scoreMap.set(cohort.id, result._avg.finalScore ?? null);
  }

  // Session count per cohort (count distinct exam sessions within cohort date range)
  const sessionCountMap = new Map<string, number>();
  for (const cohort of cohorts) {
    const examNumbers = cohortExamNumbersMap.get(cohort.id) ?? [];
    if (examNumbers.length === 0) {
      sessionCountMap.set(cohort.id, 0);
      continue;
    }
    const sessions = await prisma.examSession.findMany({
      where: {
        examDate: {
          gte: cohort.startDate,
          lte: cohort.endDate,
        },
        scores: {
          some: {
            examNumber: { in: examNumbers },
          },
        },
      },
      select: { id: true },
      distinct: ["examDate"],
    });
    sessionCountMap.set(cohort.id, sessions.length);
  }

  // Build rows
  const rows: CohortStatRow[] = cohorts.map((cohort) => {
    const groups = enrollmentGroups.filter((g) => g.cohortId === cohort.id);
    const total = groups.reduce((s, g) => s + g._count.status, 0);
    const suspended = groups
      .filter((g) => g.status === "SUSPENDED")
      .reduce((s, g) => s + g._count.status, 0);
    const active = groups
      .filter((g) => g.status === "ACTIVE" || g.status === "PENDING")
      .reduce((s, g) => s + g._count.status, 0);
    const waiting = groups
      .filter((g) => g.status === "WAITING")
      .reduce((s, g) => s + g._count.status, 0);
    const dropped = waiting; // WAITING used as proxy for non-active pending, no DROPPED status

    const att = attendanceMap.get(cohort.id) ?? { present: 0, total: 0 };

    return {
      id: cohort.id,
      name: cohort.name,
      examCategory:
        EXAM_CATEGORY_LABEL[cohort.examCategory as keyof typeof EXAM_CATEGORY_LABEL] ??
        cohort.examCategory,
      startDate: cohort.startDate.toISOString(),
      endDate: cohort.endDate.toISOString(),
      enrollmentCount: total,
      activeCount: active,
      suspendedCount: suspended,
      droppedCount: dropped,
      dropoutRate: total > 0 ? Math.round((suspended / total) * 1000) / 10 : null,
      avgScore: scoreMap.get(cohort.id) ?? null,
      attendanceRate:
        att.total > 0 ? Math.round((att.present / att.total) * 1000) / 10 : null,
      revenue: revenueMap.get(cohort.id) ?? 0,
      sessionCount: sessionCountMap.get(cohort.id) ?? 0,
    };
  });

  // Summary totals
  const totalEnrollments = rows.reduce((s, r) => s + r.enrollmentCount, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const scoredRows = rows.filter((r) => r.avgScore !== null);
  const overallAvgScore =
    scoredRows.length > 0
      ? Math.round((scoredRows.reduce((s, r) => s + r.avgScore!, 0) / scoredRows.length) * 10) / 10
      : null;
  const attRows = rows.filter((r) => r.attendanceRate !== null);
  const overallAttendanceRate =
    attRows.length > 0
      ? Math.round((attRows.reduce((s, r) => s + r.attendanceRate!, 0) / attRows.length) * 10) / 10
      : null;

  const examTypeOptions: Array<{ value: string; label: string }> = [
    { value: "ALL", label: "전체 직렬" },
    { value: "GONGCHAE", label: "공채" },
    { value: "GYEONGCHAE", label: "경채" },
  ];
  const selectedExamType = examTypeParam ?? "ALL";

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        분석
      </div>
      <h1 className="mt-5 text-3xl font-semibold">기수별 코호트 분석</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        최근 10개 기수의 등록 현황, 중도탈락율, 평균 성적, 출석률, 수납액을 한눈에 비교합니다.
        전회차 대비 증감은 ▲▼ 배지로 확인할 수 있습니다.
      </p>

      {/* Filter */}
      <form
        method="get"
        className="mt-8 flex flex-wrap gap-4 rounded-[28px] border border-ink/10 bg-mist p-6"
      >
        <div className="min-w-[180px] flex-1">
          <label className="mb-2 block text-sm font-medium">시험 직렬</label>
          <select
            name="examType"
            defaultValue={selectedExamType}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            {examTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px] flex-1">
          <label className="mb-2 block text-sm font-medium">강좌 필터 (카테고리 기준)</label>
          <select
            name="courseId"
            defaultValue={courseIdParam ?? ""}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="">전체 강좌</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-3">
          <button
            type="submit"
            className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            필터 적용
          </button>
          {(courseIdParam || (examTypeParam && examTypeParam !== "ALL")) && (
            <Link
              href="/admin/analytics/cohorts"
              className="inline-flex items-center rounded-full border border-ink/20 px-5 py-3 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
            >
              초기화
            </Link>
          )}
        </div>
      </form>

      {/* Client component renders charts + table */}
      <div className="mt-8">
        <CohortAnalysisClient
          rows={rows}
          totalEnrollments={totalEnrollments}
          totalRevenue={totalRevenue}
          overallAvgScore={overallAvgScore}
          overallAttendanceRate={overallAttendanceRate}
        />
      </div>

      {/* Legend */}
      <section className="mt-6 rounded-[28px] border border-ink/10 bg-mist p-6">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-slate">지표 설명</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <dt className="font-semibold text-ink">인원</dt>
            <dd className="mt-1 text-slate">WAITING 포함 전체 수강 신청 건수</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">활성</dt>
            <dd className="mt-1 text-slate">현재 ACTIVE + PENDING 상태 수강생</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">휴원율</dt>
            <dd className="mt-1 text-slate">현재 SUSPENDED 상태 비율 (낮을수록 좋음)</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">평균점수</dt>
            <dd className="mt-1 text-slate">기수 기간 내 finalScore 평균 (응시자 한정)</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">출석률</dt>
            <dd className="mt-1 text-slate">기수 기간 내 NORMAL+LIVE 출결 비율</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">회차수</dt>
            <dd className="mt-1 text-slate">기수 기간 내 시험 날짜 수 (distinct examDate)</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">수납액</dt>
            <dd className="mt-1 text-slate">APPROVED 상태 Payment.netAmount 합계</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink">▲▼ 배지</dt>
            <dd className="mt-1 text-slate">직전 기수 대비 증감 (초록 상승, 빨강 하락)</dd>
          </div>
        </dl>
      </section>

      {/* Navigation */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/analytics"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          ← 분석 허브
        </Link>
        <Link
          href="/admin/settings/cohorts"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          기수 관리 →
        </Link>
        <Link
          href="/admin/analytics/retention"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          재원율 분석 →
        </Link>
      </div>
    </div>
  );
}
