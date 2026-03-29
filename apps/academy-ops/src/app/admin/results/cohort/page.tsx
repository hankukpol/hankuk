import { AdminRole, AttendType, Subject } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { EXAM_CATEGORY_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import CohortStatsCharts from "./cohort-stats-charts";
import type {
  CohortSummary,
  SelectedCohortDetail,
  ScoreDistributionBucket,
  SubjectAverage,
  TopStudent,
} from "./cohort-stats-charts";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function readParam(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | null {
  const val = searchParams?.[key];
  if (!val) return null;
  return Array.isArray(val) ? (val[0] ?? null) : val;
}

// ─── Score bucket ranges ────────────────────────────────────────────────────────

const SCORE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "0-9", min: 0, max: 10 },
  { label: "10-19", min: 10, max: 20 },
  { label: "20-29", min: 20, max: 30 },
  { label: "30-39", min: 30, max: 40 },
  { label: "40-49", min: 40, max: 50 },
  { label: "50-59", min: 50, max: 60 },
  { label: "60-69", min: 60, max: 70 },
  { label: "70-79", min: 70, max: 80 },
  { label: "80-89", min: 80, max: 90 },
  { label: "90-100", min: 90, max: 101 },
];

function resolveScore(finalScore: number | null, rawScore: number | null): number | null {
  if (finalScore !== null) return finalScore;
  if (rawScore !== null) return rawScore;
  return null;
}

// ─── Per-cohort stats ────────────────────────────────────────────────────────────

async function getCohortSummary(
  cohortId: string,
  cohortName: string,
  examCategory: string,
): Promise<CohortSummary> {
  const prisma = getPrisma();

  const enrollments = await prisma.courseEnrollment.findMany({
    where: { cohortId, status: { in: ["ACTIVE", "COMPLETED", "SUSPENDED"] } },
    select: { examNumber: true },
  });

  const examNumbers = [...new Set(enrollments.map((e) => e.examNumber))];

  if (examNumbers.length === 0) {
    return {
      id: cohortId,
      name: cohortName,
      examCategory,
      studentCount: 0,
      avgScore: null,
      topScore: null,
      bottomScore: null,
      passRate: null,
    };
  }

  const scores = await prisma.score.findMany({
    where: {
      examNumber: { in: examNumbers },
      attendType: { notIn: [AttendType.ABSENT, AttendType.EXCUSED] },
      session: { subject: { not: Subject.CUMULATIVE } },
    },
    select: { examNumber: true, finalScore: true, rawScore: true },
  });

  const byStudent = new Map<string, number[]>();
  for (const s of scores) {
    const val = resolveScore(s.finalScore, s.rawScore);
    if (val === null) continue;
    const arr = byStudent.get(s.examNumber) ?? [];
    arr.push(val);
    byStudent.set(s.examNumber, arr);
  }

  const studentAvgs: number[] = [];
  for (const [, vals] of byStudent) {
    if (vals.length > 0) {
      studentAvgs.push(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
  }

  if (studentAvgs.length === 0) {
    return {
      id: cohortId,
      name: cohortName,
      examCategory,
      studentCount: examNumbers.length,
      avgScore: null,
      topScore: null,
      bottomScore: null,
      passRate: null,
    };
  }

  const avg = studentAvgs.reduce((a, b) => a + b, 0) / studentAvgs.length;
  const top = Math.max(...studentAvgs);
  const bottom = Math.min(...studentAvgs);
  const passRate = (studentAvgs.filter((v) => v >= 60).length / studentAvgs.length) * 100;

  return {
    id: cohortId,
    name: cohortName,
    examCategory,
    studentCount: examNumbers.length,
    avgScore: Math.round(avg * 10) / 10,
    topScore: Math.round(top * 10) / 10,
    bottomScore: Math.round(bottom * 10) / 10,
    passRate: Math.round(passRate * 10) / 10,
  };
}

async function getSelectedCohortDetail(
  summary: CohortSummary,
): Promise<SelectedCohortDetail> {
  const prisma = getPrisma();

  const enrollments = await prisma.courseEnrollment.findMany({
    where: { cohortId: summary.id, status: { in: ["ACTIVE", "COMPLETED", "SUSPENDED"] } },
    select: { examNumber: true },
  });
  const examNumbers = [...new Set(enrollments.map((e) => e.examNumber))];

  if (examNumbers.length === 0) {
    return {
      ...summary,
      scoreDistribution: SCORE_BUCKETS.map((b) => ({ range: b.label, count: 0 })),
      subjectAverages: [],
      top10: [],
    };
  }

  const scores = await prisma.score.findMany({
    where: {
      examNumber: { in: examNumbers },
      attendType: { notIn: [AttendType.ABSENT, AttendType.EXCUSED] },
    },
    select: {
      examNumber: true,
      finalScore: true,
      rawScore: true,
      session: { select: { subject: true } },
    },
  });

  const nonCumulative = scores.filter((s) => s.session.subject !== Subject.CUMULATIVE);

  // Per-student average (non-cumulative)
  const byStudentAvg = new Map<string, number[]>();
  for (const s of nonCumulative) {
    const val = resolveScore(s.finalScore, s.rawScore);
    if (val === null) continue;
    const arr = byStudentAvg.get(s.examNumber) ?? [];
    arr.push(val);
    byStudentAvg.set(s.examNumber, arr);
  }

  const studentAvgMap = new Map<string, number>();
  for (const [en, vals] of byStudentAvg) {
    if (vals.length > 0) {
      studentAvgMap.set(en, vals.reduce((a, b) => a + b, 0) / vals.length);
    }
  }

  // Score distribution
  const studentAvgArr = [...studentAvgMap.values()];
  const scoreDistribution: ScoreDistributionBucket[] = SCORE_BUCKETS.map((b) => ({
    range: b.label,
    count: studentAvgArr.filter((v) => v >= b.min && v < b.max).length,
  }));

  // Subject averages
  const bySubject = new Map<Subject, number[]>();
  for (const s of nonCumulative) {
    const val = resolveScore(s.finalScore, s.rawScore);
    if (val === null) continue;
    const arr = bySubject.get(s.session.subject) ?? [];
    arr.push(val);
    bySubject.set(s.session.subject, arr);
  }

  const subjectAverages: SubjectAverage[] = [];
  for (const [subject, vals] of bySubject) {
    if (vals.length > 0) {
      subjectAverages.push({
        subject,
        label: SUBJECT_LABEL[subject] ?? subject,
        avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
      });
    }
  }
  subjectAverages.sort((a, b) => a.label.localeCompare(b.label, "ko"));

  // Top 10
  const sorted = [...studentAvgMap.entries()].sort((a, b) => b[1] - a[1]);
  const top10Nums = sorted.slice(0, 10).map(([en]) => en);

  const studentDetails = await prisma.student.findMany({
    where: { examNumber: { in: top10Nums } },
    select: { examNumber: true, name: true },
  });
  const studentMap = new Map(studentDetails.map((s) => [s.examNumber, s.name]));

  const top10: TopStudent[] = sorted.slice(0, 10).map(([en, avg], idx) => {
    // best subject for this student
    const subjectVals = new Map<Subject, number[]>();
    for (const s of nonCumulative.filter((sc) => sc.examNumber === en)) {
      const val = resolveScore(s.finalScore, s.rawScore);
      if (val === null) continue;
      const arr = subjectVals.get(s.session.subject) ?? [];
      arr.push(val);
      subjectVals.set(s.session.subject, arr);
    }
    let bestSubject = "-";
    let bestAvg = -1;
    for (const [subj, vals] of subjectVals) {
      const a = vals.reduce((x, y) => x + y, 0) / vals.length;
      if (a > bestAvg) {
        bestAvg = a;
        bestSubject = SUBJECT_LABEL[subj] ?? subj;
      }
    }

    return {
      rank: idx + 1,
      examNumber: en,
      name: studentMap.get(en) ?? "-",
      avgScore: Math.round(avg * 10) / 10,
      bestSubject,
    };
  });

  return { ...summary, scoreDistribution, subjectAverages, top10 };
}

// ─── Page ────────────────────────────────────────────────────────────────────────

export default async function CohortResultsPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const cohortId = readParam(searchParams, "cohortId");
  const prisma = getPrisma();

  // Load all active cohorts for the selector
  const allCohorts = await prisma.cohort.findMany({
    where: { isActive: true },
    orderBy: [{ examCategory: "asc" }, { startDate: "desc" }],
    select: {
      id: true,
      name: true,
      examCategory: true,
      startDate: true,
      endDate: true,
    },
  });

  // Build summary for each cohort in parallel
  const cohorts: CohortSummary[] = await Promise.all(
    allCohorts.map((c) => getCohortSummary(c.id, c.name, c.examCategory)),
  );

  // If a specific cohort is selected, build its detail
  let selectedCohort: SelectedCohortDetail | null = null;
  if (cohortId) {
    const summary = cohorts.find((c) => c.id === cohortId) ?? null;
    if (summary) {
      selectedCohort = await getSelectedCohortDetail(summary);
    }
  }

  const selectedCohortInfo = cohortId
    ? allCohorts.find((c) => c.id === cohortId) ?? null
    : null;

  return (
    <div className="p-8 sm:p-10">
      {/* Header */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        성적 관리
      </div>
      <h1 className="mt-5 text-3xl font-semibold">기수별 성적 통계</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        수강 기수를 선택하면 해당 기수의 점수 분포, 과목별 평균, 상위 10명 현황을 확인할 수 있습니다.
        기수를 선택하지 않으면 모든 기수의 평균 점수와 합격률을 비교합니다.
      </p>

      {/* Cohort selector */}
      <form
        method="get"
        className="mt-8 grid gap-4 rounded-[28px] border border-ink/10 bg-mist p-6 md:grid-cols-3"
      >
        <div>
          <label className="mb-2 block text-sm font-medium">기수 선택</label>
          <select
            name="cohortId"
            defaultValue={cohortId ?? ""}
            className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
          >
            <option value="">전체 기수 비교</option>
            {allCohorts.map((c) => (
              <option key={c.id} value={c.id}>
                [{EXAM_CATEGORY_LABEL[c.examCategory] ?? c.examCategory}] {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
          >
            조회
          </button>
        </div>
      </form>

      {/* Selected cohort info badge */}
      {selectedCohortInfo && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-ember/30 bg-ember/10 px-3 py-1 text-xs font-semibold text-ember">
            {EXAM_CATEGORY_LABEL[selectedCohortInfo.examCategory] ?? selectedCohortInfo.examCategory}
          </span>
          <h2 className="text-lg font-semibold text-ink">{selectedCohortInfo.name}</h2>
          <span className="text-xs text-slate">
            {selectedCohortInfo.startDate.toLocaleDateString("ko-KR")} ~{" "}
            {selectedCohortInfo.endDate.toLocaleDateString("ko-KR")}
          </span>
        </div>
      )}

      {allCohorts.length === 0 ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
          등록된 기수가 없습니다.{" "}
          <a href="/admin/settings/cohorts" className="text-ember underline">
            기수 관리
          </a>
          에서 먼저 기수를 등록해 주세요.
        </div>
      ) : (
        <CohortStatsCharts cohorts={cohorts} selectedCohort={selectedCohort} />
      )}
    </div>
  );
}
