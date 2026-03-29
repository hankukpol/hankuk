import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/admin/breadcrumbs";

export const dynamic = "force-dynamic";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

function fmtPct(rate: number | null) {
  if (rate === null) return "—";
  return `${rate.toFixed(1)}%`;
}

function fmtScore(score: number | null) {
  if (score === null) return "—";
  return `${score.toFixed(1)}점`;
}

/** Parse time string "HH:MM" → minutes */
function parseMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Calculate duration in hours between startTime and endTime */
function durationHours(startTime: string, endTime: string): number {
  const diff = parseMinutes(endTime) - parseMinutes(startTime);
  return diff > 0 ? diff / 60 : 0;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type InstructorRow = {
  id: string;
  name: string;
  subject: string;
  isActive: boolean;
  activeCohorts: number;
  totalStudents: number;
  completedStudents: number;
  completionRate: number | null;
  avgScore: number | null;
  academyAvgDiff: number | null; // positive = above academy avg, negative = below
  lectureHoursThisMonth: number;
  monthlyRevenue: number;
  aboveAvg: boolean | null;
};

// ─── Page ─────────────────────────────────────────────────────────────────────

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InstructorPerformancePage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.MANAGER);

  const sp = searchParams ? await searchParams : {};
  const sortParam = Array.isArray(sp.sort) ? sp.sort[0] : (sp.sort ?? "students");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const monthLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월`;

  const db = getPrisma();

  // ── 1. Active instructors ──────────────────────────────────────────────────
  const instructors = await db.instructor.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      subject: true,
      isActive: true,
    },
    orderBy: { name: "asc" },
  }).catch(() => []);

  if (instructors.length === 0) {
    return (
      <div className="p-8 sm:p-10">
        <Breadcrumbs
          items={[
            { label: "분석", href: "/admin/analytics" },
            { label: "강사 성과 분석" },
          ]}
        />
        <div className="mt-8 rounded-[28px] border border-ink/10 bg-mist p-10 text-center">
          <p className="text-sm text-slate">등록된 강사가 없습니다.</p>
          <Link
            href="/admin/instructors"
            className="mt-4 inline-flex items-center rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest/90"
          >
            강사 관리
          </Link>
        </div>
      </div>
    );
  }

  // ── 2. LectureSchedules grouped by instructorName ──────────────────────────
  // Each LectureSchedule has instructorName (string) tied to a Cohort
  const schedules = await db.lectureSchedule.findMany({
    where: {
      isActive: true,
      instructorName: { not: null, in: instructors.map((i) => i.name) },
    },
    select: {
      id: true,
      cohortId: true,
      instructorName: true,
      startTime: true,
      endTime: true,
      cohort: {
        select: {
          id: true,
          name: true,
          isActive: true,
          enrollments: {
            select: {
              id: true,
              status: true,
              examNumber: true,
            },
          },
        },
      },
      sessions: {
        where: {
          isCancelled: false,
          sessionDate: { gte: monthStart, lte: monthEnd },
        },
        select: {
          id: true,
          startTime: true,
          endTime: true,
        },
      },
    },
  }).catch(() => []);

  // ── 3. Academy-wide average score (all time) ───────────────────────────────
  const academyScoreAgg = await db.score.aggregate({
    where: {
      finalScore: { not: null },
      attendType: "NORMAL",
    },
    _avg: { finalScore: true },
  }).catch(() => ({ _avg: { finalScore: null } }));

  const academyAvgScore = academyScoreAgg._avg.finalScore;

  // ── 4. Score averages by cohort (for instructors' cohorts) ────────────────
  const cohortIds = Array.from(new Set(schedules.map((s) => s.cohortId)));

  // Score data: scores for students in each cohort
  const cohortScores = cohortIds.length > 0
    ? await db.score.findMany({
        where: {
          finalScore: { not: null },
          attendType: "NORMAL",
          // We need to join through enrollments → cohort, so we filter by examNumber
          // This is approximate; we'll group by examNumber and average
        },
        select: {
          examNumber: true,
          finalScore: true,
        },
      }).catch(() => [])
    : [];

  // Build examNumber → cohortId map from schedules
  const examNumberToCohortId = new Map<string, string>();
  for (const sched of schedules) {
    for (const enroll of sched.cohort.enrollments) {
      if (enroll.status === "ACTIVE" || enroll.status === "COMPLETED") {
        examNumberToCohortId.set(enroll.examNumber, sched.cohortId);
      }
    }
  }

  // Group scores by cohort
  const cohortScoreMap = new Map<string, number[]>();
  for (const score of cohortScores) {
    const cohortId = examNumberToCohortId.get(score.examNumber);
    if (cohortId && score.finalScore !== null) {
      const arr = cohortScoreMap.get(cohortId) ?? [];
      arr.push(score.finalScore);
      cohortScoreMap.set(cohortId, arr);
    }
  }

  // ── 5. Monthly payments for cohorts ───────────────────────────────────────
  const cohortEnrollmentIds = schedules
    .flatMap((s) => s.cohort.enrollments.map((e) => e.id));

  const cohortPayments =
    cohortEnrollmentIds.length > 0
      ? await db.payment.findMany({
          where: {
            enrollmentId: { in: cohortEnrollmentIds },
            status: { in: ["APPROVED", "PARTIAL_REFUNDED"] },
            processedAt: { gte: monthStart, lte: monthEnd },
          },
          select: {
            enrollmentId: true,
            netAmount: true,
          },
        }).catch(() => [])
      : [];

  // Build enrollmentId → cohortId map
  const enrollmentIdToCohortId = new Map<string, string>();
  for (const sched of schedules) {
    for (const enroll of sched.cohort.enrollments) {
      enrollmentIdToCohortId.set(enroll.id, sched.cohortId);
    }
  }

  // Revenue by cohortId
  const cohortRevenue = new Map<string, number>();
  for (const p of cohortPayments) {
    if (!p.enrollmentId) continue;
    const cId = enrollmentIdToCohortId.get(p.enrollmentId);
    if (cId) {
      cohortRevenue.set(cId, (cohortRevenue.get(cId) ?? 0) + p.netAmount);
    }
  }

  // ── 6. Build per-instructor aggregated rows ───────────────────────────────
  const rows: InstructorRow[] = instructors.map((instructor) => {
    const mySchedules = schedules.filter((s) => s.instructorName === instructor.name);
    const myCohortIds = Array.from(new Set(mySchedules.map((s) => s.cohortId)));

    const activeCohorts = mySchedules.filter((s) => s.cohort.isActive).length > 0
      ? new Set(mySchedules.filter((s) => s.cohort.isActive).map((s) => s.cohortId)).size
      : 0;

    // Students: enrolled/active/completed in my cohorts
    const myEnrollments = mySchedules.flatMap((s) => s.cohort.enrollments);
    const uniqueEnrollmentsByEnrollId = new Map<string, (typeof myEnrollments)[0]>();
    for (const e of myEnrollments) {
      uniqueEnrollmentsByEnrollId.set(e.id, e);
    }
    const uniqueEnrollments = Array.from(uniqueEnrollmentsByEnrollId.values());

    const totalStudents = new Set(
      uniqueEnrollments
        .filter((e) => e.status !== "PENDING" && e.status !== "CANCELLED")
        .map((e) => e.examNumber),
    ).size;

    const completedStudents = new Set(
      uniqueEnrollments
        .filter((e) => e.status === "COMPLETED")
        .map((e) => e.examNumber),
    ).size;

    const enrolledStudents = new Set(
      uniqueEnrollments
        .filter((e) =>
          e.status === "ACTIVE" ||
          e.status === "COMPLETED" ||
          e.status === "WITHDRAWN",
        )
        .map((e) => e.examNumber),
    ).size;

    const completionRate =
      enrolledStudents > 0 ? (completedStudents / enrolledStudents) * 100 : null;

    // Average score across my cohorts
    const allScores = myCohortIds.flatMap((cId) => cohortScoreMap.get(cId) ?? []);
    const avgScore =
      allScores.length > 0
        ? allScores.reduce((s, v) => s + v, 0) / allScores.length
        : null;

    const academyAvgDiff =
      avgScore !== null && academyAvgScore !== null ? avgScore - academyAvgScore : null;

    // Lecture hours this month
    let lectureHoursThisMonth = 0;
    for (const sched of mySchedules) {
      for (const session of sched.sessions) {
        lectureHoursThisMonth += durationHours(session.startTime, session.endTime);
      }
    }
    // If session times not detailed, fallback to schedule times × session count
    if (lectureHoursThisMonth === 0) {
      for (const sched of mySchedules) {
        const sessionCount = sched.sessions.length;
        if (sessionCount > 0) {
          lectureHoursThisMonth +=
            sessionCount * durationHours(sched.startTime, sched.endTime);
        }
      }
    }

    // Revenue from my cohorts this month
    const monthlyRevenue = myCohortIds.reduce(
      (s, cId) => s + (cohortRevenue.get(cId) ?? 0),
      0,
    );

    const aboveAvg = academyAvgDiff !== null ? academyAvgDiff >= 0 : null;

    return {
      id: instructor.id,
      name: instructor.name,
      subject: instructor.subject,
      isActive: instructor.isActive,
      activeCohorts,
      totalStudents,
      completedStudents,
      completionRate,
      avgScore,
      academyAvgDiff,
      lectureHoursThisMonth,
      monthlyRevenue,
      aboveAvg,
    };
  });

  // ── 7. Sort ───────────────────────────────────────────────────────────────
  const sorted = [...rows].sort((a, b) => {
    switch (sortParam) {
      case "score":
        return (b.avgScore ?? -1) - (a.avgScore ?? -1);
      case "completion":
        return (b.completionRate ?? -1) - (a.completionRate ?? -1);
      case "hours":
        return b.lectureHoursThisMonth - a.lectureHoursThisMonth;
      case "revenue":
        return b.monthlyRevenue - a.monthlyRevenue;
      case "cohorts":
        return b.activeCohorts - a.activeCohorts;
      default: // "students"
        return b.totalStudents - a.totalStudents;
    }
  });

  // ── 8. KPI summaries ──────────────────────────────────────────────────────
  const activeInstructorCount = rows.filter((r) => r.activeCohorts > 0).length;
  const totalStudentCount = rows.reduce((s, r) => s + r.totalStudents, 0);
  const avgLectureHours =
    activeInstructorCount > 0
      ? rows.reduce((s, r) => s + r.lectureHoursThisMonth, 0) / activeInstructorCount
      : 0;
  const avgCompletionRate = (() => {
    const withRate = rows.filter((r) => r.completionRate !== null);
    if (withRate.length === 0) return null;
    return withRate.reduce((s, r) => s + (r.completionRate ?? 0), 0) / withRate.length;
  })();

  const SORT_OPTIONS = [
    { value: "students", label: "수강생 수" },
    { value: "cohorts", label: "활성 기수" },
    { value: "score", label: "평균 점수" },
    { value: "completion", label: "완료율" },
    { value: "hours", label: "강의 시간" },
    { value: "revenue", label: "매출" },
  ];

  return (
    <div className="p-8 sm:p-10">
      <Breadcrumbs
        items={[
          { label: "분석", href: "/admin/analytics" },
          { label: "강사 성과 분석" },
        ]}
      />

      <div className="mt-2">
        <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
          강사 분석
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-ink">강사 성과 분석</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate">
          강사별 담당 기수·수강생·완료율·평균 점수·강의 시간을 종합 분석합니다.
          점수 색상은 학원 전체 평균 대비 성과를 나타냅니다.
        </p>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[20px] border border-forest/20 bg-forest/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest">활성 강사 수</p>
          <p className="mt-3 text-3xl font-bold text-forest">{activeInstructorCount}</p>
          <p className="mt-1 text-xs text-slate">기수 담당 중</p>
        </div>
        <div className="rounded-[20px] border border-ink/10 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate">총 수강생</p>
          <p className="mt-3 text-3xl font-bold text-ink">{fmt(totalStudentCount)}</p>
          <p className="mt-1 text-xs text-slate">강사 담당 합계</p>
        </div>
        <div className="rounded-[20px] border border-sky-200 bg-sky-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">
            평균 강의 시간
          </p>
          <p className="mt-3 text-3xl font-bold text-sky-700">{avgLectureHours.toFixed(1)}h</p>
          <p className="mt-1 text-xs text-slate">{monthLabel} 강사당 평균</p>
        </div>
        <div className="rounded-[20px] border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">
            평균 완료율
          </p>
          <p className="mt-3 text-3xl font-bold text-amber-700">{fmtPct(avgCompletionRate)}</p>
          <p className="mt-1 text-xs text-slate">전체 강사 기준</p>
        </div>
      </div>

      {/* ── Sort controls ──────────────────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate">정렬:</span>
        {SORT_OPTIONS.map((opt) => (
          <Link
            key={opt.value}
            href={`/admin/analytics/instructor-performance?sort=${opt.value}`}
            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              sortParam === opt.value
                ? "border-forest bg-forest text-white"
                : "border-ink/15 bg-white text-slate hover:border-forest/30 hover:text-forest"
            }`}
          >
            {opt.label}
          </Link>
        ))}
        {academyAvgScore !== null && (
          <span className="ml-auto text-xs text-slate">
            학원 전체 평균:{" "}
            <strong className="text-ink">{academyAvgScore.toFixed(1)}점</strong>
          </span>
        )}
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="mt-4 overflow-hidden rounded-[28px] border border-ink/10 bg-white">
        {sorted.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate">
            성과 데이터가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs font-semibold uppercase tracking-wide text-slate">
                  <th className="px-5 py-4">#</th>
                  <th className="px-5 py-4">강사명</th>
                  <th className="px-5 py-4">담당 과목</th>
                  <th className="px-5 py-4 text-center">활성 기수</th>
                  <th className="px-5 py-4 text-right">수강생 수</th>
                  <th className="px-5 py-4 text-right">완료율</th>
                  <th className="px-5 py-4 text-right">평균 점수</th>
                  <th className="px-5 py-4 text-right">{monthLabel} 강의시간</th>
                  <th className="px-5 py-4 text-right">{monthLabel} 매출</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {sorted.map((row, i) => {
                  const scoreColorClass =
                    row.aboveAvg === true
                      ? "font-semibold text-forest"
                      : row.aboveAvg === false
                        ? "font-semibold text-red-600"
                        : "text-slate";

                  return (
                    <tr key={row.id} className="hover:bg-mist/40">
                      <td className="px-5 py-3.5 text-xs text-slate">{i + 1}</td>
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/admin/instructors/${row.id}`}
                          className="font-semibold text-ink hover:text-ember hover:underline"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate">{row.subject}</td>
                      <td className="px-5 py-3.5 text-center">
                        {row.activeCohorts > 0 ? (
                          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2.5 py-0.5 text-xs font-semibold text-forest">
                            {row.activeCohorts}개
                          </span>
                        ) : (
                          <span className="text-slate">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {row.totalStudents > 0 ? (
                          <span className="font-semibold text-ink">{fmt(row.totalStudents)}명</span>
                        ) : (
                          <span className="text-slate">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {row.completionRate !== null ? (
                          <span
                            className={`font-semibold ${row.completionRate >= 70 ? "text-forest" : row.completionRate >= 40 ? "text-amber-600" : "text-red-600"}`}
                          >
                            {row.completionRate.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-slate">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className={scoreColorClass}>
                          {fmtScore(row.avgScore)}
                        </div>
                        {row.academyAvgDiff !== null && (
                          <div className="mt-0.5 text-xs">
                            <span
                              className={
                                row.academyAvgDiff >= 0 ? "text-forest" : "text-red-500"
                              }
                            >
                              {row.academyAvgDiff >= 0 ? "+" : ""}
                              {row.academyAvgDiff.toFixed(1)}
                            </span>
                            <span className="ml-1 text-slate">vs 평균</span>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {row.lectureHoursThisMonth > 0 ? (
                          <span className="text-ink">{row.lectureHoursThisMonth.toFixed(1)}h</span>
                        ) : (
                          <span className="text-slate">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {row.monthlyRevenue > 0 ? (
                          <span className="font-semibold text-ember">
                            {(row.monthlyRevenue / 10_000).toFixed(0)}만원
                          </span>
                        ) : (
                          <span className="text-slate">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 범례 안내 ──────────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-4 rounded-[20px] border border-ink/10 bg-mist/60 px-5 py-4 text-xs leading-6 text-slate">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-forest" />
          <span>평균 점수 ≥ 학원 평균</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span>평균 점수 &lt; 학원 평균</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-amber-500" />
          <span>완료율 40~70%</span>
        </div>
        <span className="ml-auto">
          학원 평균:{" "}
          <strong className="text-ink">
            {academyAvgScore !== null ? `${academyAvgScore.toFixed(1)}점` : "데이터 없음"}
          </strong>
        </span>
      </div>

      {/* ── 하단 링크 ──────────────────────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/admin/analytics"
          className="inline-flex items-center rounded-full border border-ink/20 bg-white px-4 py-2 text-xs font-semibold text-slate transition hover:border-ink/40 hover:text-ink"
        >
          분석 허브로
        </Link>
        <Link
          href="/admin/instructors"
          className="inline-flex items-center rounded-full border border-forest/20 bg-forest/5 px-4 py-2 text-xs font-semibold text-forest transition hover:bg-forest/10"
        >
          강사 관리
        </Link>
        <Link
          href="/admin/analytics/staff-performance"
          className="inline-flex items-center rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-xs font-semibold text-ember transition hover:bg-ember/10"
        >
          직원 KPI 성과
        </Link>
        <Link
          href="/admin/reports/instructor-settlement"
          className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
        >
          강사 정산 보고서
        </Link>
      </div>
    </div>
  );
}
