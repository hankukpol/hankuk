import { AdminRole, AttendType, Subject } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { SUBJECT_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// ─── Types ─────────────────────────────────────────────────────────────────────

type CohortSummary = {
  id: string;
  name: string;
  examCategory: string;
  studentCount: number;
  avgScore: number | null;
  topScore: number | null;
  bottomScore: number | null;
  passRate: number | null;
};

type ScoreDistributionBucket = {
  range: string;
  count: number;
};

type SubjectAverage = {
  subject: string;
  label: string;
  avg: number;
};

type TopStudent = {
  rank: number;
  examNumber: string;
  name: string;
  avgScore: number;
  bestSubject: string;
};

type SelectedCohortDetail = CohortSummary & {
  scoreDistribution: ScoreDistributionBucket[];
  subjectAverages: SubjectAverage[];
  top10: TopStudent[];
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

/** Return the best available score from a Score row. */
function resolveScore(finalScore: number | null, rawScore: number | null): number | null {
  if (finalScore !== null) return finalScore;
  if (rawScore !== null) return rawScore;
  return null;
}

// ─── Handler ───────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = request.nextUrl.searchParams;
  const cohortId = sp.get("cohortId") ?? null;

  const prisma = getPrisma();

  // ── 1. Load all active cohorts ──────────────────────────────────────────────
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

  // ── 2. Compute summary stats for every cohort ───────────────────────────────
  //   Strategy: for each cohort, find active enrollments, then fetch scores
  //   for those students. Score table has no cohort FK, so we join via student.

  const cohortSummaries: CohortSummary[] = await Promise.all(
    allCohorts.map(async (cohort) => {
      // Active/completed enrollments in this cohort
      const enrollments = await prisma.courseEnrollment.findMany({
        where: {
          cohortId: cohort.id,
          status: { in: ["ACTIVE", "COMPLETED", "SUSPENDED"] },
        },
        select: { examNumber: true },
      });

      const examNumbers = [...new Set(enrollments.map((e) => e.examNumber))];

      if (examNumbers.length === 0) {
        return {
          id: cohort.id,
          name: cohort.name,
          examCategory: cohort.examCategory,
          studentCount: 0,
          avgScore: null,
          topScore: null,
          bottomScore: null,
          passRate: null,
        };
      }

      // Fetch all scores for these students – exclude CUMULATIVE subject and absent rows
      const scores = await prisma.score.findMany({
        where: {
          examNumber: { in: examNumbers },
          attendType: { notIn: [AttendType.ABSENT, AttendType.EXCUSED] },
          session: { subject: { not: Subject.CUMULATIVE } },
        },
        select: { examNumber: true, finalScore: true, rawScore: true },
      });

      if (scores.length === 0) {
        return {
          id: cohort.id,
          name: cohort.name,
          examCategory: cohort.examCategory,
          studentCount: examNumbers.length,
          avgScore: null,
          topScore: null,
          bottomScore: null,
          passRate: null,
        };
      }

      // Per-student average score
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
          id: cohort.id,
          name: cohort.name,
          examCategory: cohort.examCategory,
          studentCount: examNumbers.length,
          avgScore: null,
          topScore: null,
          bottomScore: null,
          passRate: null,
        };
      }

      const avgScore = studentAvgs.reduce((a, b) => a + b, 0) / studentAvgs.length;
      const topScore = Math.max(...studentAvgs);
      const bottomScore = Math.min(...studentAvgs);
      const passCount = studentAvgs.filter((v) => v >= 60).length;
      const passRate = (passCount / studentAvgs.length) * 100;

      return {
        id: cohort.id,
        name: cohort.name,
        examCategory: cohort.examCategory,
        studentCount: examNumbers.length,
        avgScore: Math.round(avgScore * 10) / 10,
        topScore: Math.round(topScore * 10) / 10,
        bottomScore: Math.round(bottomScore * 10) / 10,
        passRate: Math.round(passRate * 10) / 10,
      };
    }),
  );

  // ── 3. Selected cohort detail (when cohortId is given) ──────────────────────
  let selectedCohort: SelectedCohortDetail | null = null;

  if (cohortId) {
    const summary = cohortSummaries.find((c) => c.id === cohortId) ?? null;

    if (summary) {
      // Re-fetch enrollments for this cohort
      const enrollments = await prisma.courseEnrollment.findMany({
        where: {
          cohortId,
          status: { in: ["ACTIVE", "COMPLETED", "SUSPENDED"] },
        },
        select: { examNumber: true },
      });
      const examNumbers = [...new Set(enrollments.map((e) => e.examNumber))];

      if (examNumbers.length === 0) {
        selectedCohort = {
          ...summary,
          scoreDistribution: SCORE_BUCKETS.map((b) => ({ range: b.label, count: 0 })),
          subjectAverages: [],
          top10: [],
        };
      } else {
        // Fetch scores with session subject
        const scores = await prisma.score.findMany({
          where: {
            examNumber: { in: examNumbers },
            attendType: { notIn: [AttendType.ABSENT, AttendType.EXCUSED] },
          },
          select: {
            examNumber: true,
            finalScore: true,
            rawScore: true,
            attendType: true,
            session: { select: { subject: true } },
          },
        });

        // --- Score distribution (based on student averages, non-cumulative) ---
        const nonCumulativeScores = scores.filter(
          (s) => s.session.subject !== Subject.CUMULATIVE,
        );

        const byStudentAvg = new Map<string, number[]>();
        for (const s of nonCumulativeScores) {
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

        const studentAvgArr = [...studentAvgMap.values()];

        const scoreDistribution: ScoreDistributionBucket[] = SCORE_BUCKETS.map((bucket) => ({
          range: bucket.label,
          count: studentAvgArr.filter((v) => v >= bucket.min && v < bucket.max).length,
        }));

        // --- Subject averages ---
        const bySubject = new Map<Subject, number[]>();
        for (const s of nonCumulativeScores) {
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

        // Sort by subject label for consistency
        subjectAverages.sort((a, b) => a.label.localeCompare(b.label, "ko"));

        // --- Top 10 students ---
        const sortedStudents = [...studentAvgMap.entries()].sort((a, b) => b[1] - a[1]);
        const top10ExamNumbers = sortedStudents.slice(0, 10).map(([en]) => en);

        const studentDetails = await prisma.student.findMany({
          where: { examNumber: { in: top10ExamNumbers } },
          select: { examNumber: true, name: true },
        });
        const studentMap = new Map(studentDetails.map((s) => [s.examNumber, s.name]));

        // Find best subject per student
        const bestSubjectMap = new Map<string, string>();
        for (const en of top10ExamNumbers) {
          const studentSubjectScores = new Map<Subject, number[]>();
          for (const s of nonCumulativeScores.filter((sc) => sc.examNumber === en)) {
            const val = resolveScore(s.finalScore, s.rawScore);
            if (val === null) continue;
            const arr = studentSubjectScores.get(s.session.subject) ?? [];
            arr.push(val);
            studentSubjectScores.set(s.session.subject, arr);
          }
          let bestSubject = "-";
          let bestAvg = -1;
          for (const [subj, vals] of studentSubjectScores) {
            const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
            if (avg > bestAvg) {
              bestAvg = avg;
              bestSubject = SUBJECT_LABEL[subj] ?? subj;
            }
          }
          bestSubjectMap.set(en, bestSubject);
        }

        const top10: TopStudent[] = sortedStudents.slice(0, 10).map(([en, avg], idx) => ({
          rank: idx + 1,
          examNumber: en,
          name: studentMap.get(en) ?? "-",
          avgScore: Math.round(avg * 10) / 10,
          bestSubject: bestSubjectMap.get(en) ?? "-",
        }));

        selectedCohort = {
          ...summary,
          scoreDistribution,
          subjectAverages,
          top10,
        };
      }
    }
  }

  return NextResponse.json({
    data: {
      cohorts: cohortSummaries,
      selectedCohort,
    },
  });
}
