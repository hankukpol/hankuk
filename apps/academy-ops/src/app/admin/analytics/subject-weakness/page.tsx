import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { SUBJECT_LABEL } from "@/lib/constants";
import { WeaknessClient } from "./weakness-client";

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

export type WeaknessStudent = {
  examNumber: string;
  name: string;
  avgInSubject: number;
  overallAvg: number;
  diff: number;
  severity: "심각" | "주의" | "경계";
};

export type SubjectWeaknessData = {
  subject: string;
  subjectLabel: string;
  weakStudentCount: number;
  totalStudentCount: number;
  avgScore: number;
  cohortAvg: number;
  students: WeaknessStudent[];
};

export default async function SubjectWeaknessPage({ searchParams }: PageProps) {
  await requireAdminContext(AdminRole.TEACHER);

  const examTypeParam = readParam(searchParams, "examType") ?? "ALL";
  const weeksParam = readParam(searchParams, "weeks") ?? "8";
  const weeksBack = Math.min(parseInt(weeksParam, 10) || 8, 52);

  const prisma = getPrisma();

  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - weeksBack * 7);

  const examTypeFilter: { examType?: "GONGCHAE" | "GYEONGCHAE" } =
    examTypeParam === "GONGCHAE" || examTypeParam === "GYEONGCHAE"
      ? { examType: examTypeParam }
      : {};

  // Fetch sessions
  const sessions = await prisma.examSession.findMany({
    where: {
      isCancelled: false,
      examDate: { gte: startDate, lte: now },
      ...examTypeFilter,
    },
    select: {
      id: true,
      subject: true,
    },
  });

  const sessionIds = sessions.map((s) => s.id);

  if (sessionIds.length === 0) {
    return (
      <div className="p-8 sm:p-10">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          Subject Weakness
        </div>
        <h1 className="mt-5 text-3xl font-semibold">취약 과목 분석</h1>
        <p className="mt-8 text-sm text-slate">선택한 기간에 해당하는 데이터가 없습니다.</p>
        <div className="mt-6">
          <Link
            href="/admin/analytics"
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink hover:border-forest/40 hover:text-forest"
          >
            ← 분석 허브
          </Link>
        </div>
      </div>
    );
  }

  // Fetch all scores
  const scores = await prisma.score.findMany({
    where: {
      sessionId: { in: sessionIds },
      finalScore: { not: null },
      attendType: { not: "ABSENT" },
    },
    select: {
      examNumber: true,
      sessionId: true,
      finalScore: true,
    },
  });

  // Build sessionId → subject map
  const sessionSubjectMap = new Map<number, string>();
  for (const s of sessions) {
    sessionSubjectMap.set(s.id, s.subject);
  }

  // Aggregate per student per subject
  // Map: examNumber → subject → { sum, count }
  const studentSubjectMap = new Map<string, Map<string, { sum: number; count: number }>>();
  for (const score of scores) {
    if (score.finalScore === null) continue;
    const subj = sessionSubjectMap.get(score.sessionId);
    if (!subj) continue;

    if (!studentSubjectMap.has(score.examNumber)) {
      studentSubjectMap.set(score.examNumber, new Map());
    }
    const subjMap = studentSubjectMap.get(score.examNumber)!;
    const prev = subjMap.get(subj) ?? { sum: 0, count: 0 };
    subjMap.set(subj, { sum: prev.sum + score.finalScore, count: prev.count + 1 });
  }

  // Build student names map
  const examNumbers = Array.from(studentSubjectMap.keys());
  const students =
    examNumbers.length > 0
      ? await prisma.student.findMany({
          where: { examNumber: { in: examNumbers } },
          select: { examNumber: true, name: true },
        })
      : [];
  const studentNameMap = new Map<string, string>();
  for (const s of students) {
    studentNameMap.set(s.examNumber, s.name);
  }

  // Collect all unique subjects
  const subjectSet = new Set<string>();
  for (const s of sessions) subjectSet.add(s.subject);
  const allSubjects = Array.from(subjectSet).sort();

  // Compute cohort avg per subject (all students)
  const cohortSubjectMap = new Map<string, { sum: number; count: number }>();
  for (const [, subjMap] of studentSubjectMap) {
    for (const [subj, agg] of subjMap) {
      const prev = cohortSubjectMap.get(subj) ?? { sum: 0, count: 0 };
      cohortSubjectMap.set(subj, {
        sum: prev.sum + agg.sum / agg.count,
        count: prev.count + 1,
      });
    }
  }

  // Compute per-student overall avg (across all subjects)
  const studentOverallMap = new Map<string, number>();
  for (const [examNum, subjMap] of studentSubjectMap) {
    let totalSum = 0;
    let totalCount = 0;
    for (const [, agg] of subjMap) {
      totalSum += agg.sum;
      totalCount += agg.count;
    }
    studentOverallMap.set(examNum, totalCount > 0 ? totalSum / totalCount : 0);
  }

  // Build weakness data per subject
  const subjectData: SubjectWeaknessData[] = [];

  for (const subject of allSubjects) {
    const cohortAgg = cohortSubjectMap.get(subject);
    const cohortAvg = cohortAgg && cohortAgg.count > 0 ? cohortAgg.sum / cohortAgg.count : 0;
    const subjectLabel = SUBJECT_LABEL[subject as keyof typeof SUBJECT_LABEL] ?? subject;

    const weakStudents: WeaknessStudent[] = [];
    let allStudentCount = 0;
    let subjectScoreSum = 0;
    let subjectScoreCount = 0;

    for (const [examNum, subjMap] of studentSubjectMap) {
      const agg = subjMap.get(subject);
      if (!agg) continue;
      allStudentCount++;
      const avgInSubject = agg.sum / agg.count;
      subjectScoreSum += avgInSubject;
      subjectScoreCount++;

      const overallAvg = studentOverallMap.get(examNum) ?? 0;

      // Weak criteria: avg < 60 OR below cohort avg by 10+
      const isBelowThreshold = avgInSubject < 60;
      const isBelowCohort = cohortAvg > 0 && cohortAvg - avgInSubject >= 10;

      if (isBelowThreshold || isBelowCohort) {
        let severity: "심각" | "주의" | "경계";
        if (avgInSubject < 50) severity = "심각";
        else if (avgInSubject < 60) severity = "주의";
        else severity = "경계";

        weakStudents.push({
          examNumber: examNum,
          name: studentNameMap.get(examNum) ?? examNum,
          avgInSubject: Math.round(avgInSubject * 10) / 10,
          overallAvg: Math.round(overallAvg * 10) / 10,
          diff: Math.round((avgInSubject - overallAvg) * 10) / 10,
          severity,
        });
      }
    }

    weakStudents.sort((a, b) => a.avgInSubject - b.avgInSubject);

    subjectData.push({
      subject,
      subjectLabel,
      weakStudentCount: weakStudents.length,
      totalStudentCount: allStudentCount,
      avgScore:
        subjectScoreCount > 0
          ? Math.round((subjectScoreSum / subjectScoreCount) * 10) / 10
          : 0,
      cohortAvg: Math.round(cohortAvg * 10) / 10,
      students: weakStudents,
    });
  }

  // Sort by weak student count desc
  subjectData.sort((a, b) => b.weakStudentCount - a.weakStudentCount);

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
        Subject Weakness
      </div>
      <h1 className="mt-5 text-3xl font-semibold">취약 과목 분석</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        과목별 취약 학생을 심각도로 분류하고, 면담 대상을 선정합니다.
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
          {(examTypeParam !== "ALL" || weeksParam !== "8") && (
            <Link
              href="/admin/analytics/subject-weakness"
              className="inline-flex items-center rounded-full border border-ink/20 px-5 py-3 text-sm font-medium text-ink transition hover:border-forest/40 hover:text-forest"
            >
              초기화
            </Link>
          )}
        </div>
      </form>

      {/* Client Component */}
      <div className="mt-8">
        <WeaknessClient subjectData={subjectData} />
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
          과목별 히트맵 →
        </Link>
        <Link
          href="/admin/analytics/score-forecast"
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-forest/40 hover:text-forest"
        >
          성적 예측 →
        </Link>
      </div>
    </div>
  );
}
