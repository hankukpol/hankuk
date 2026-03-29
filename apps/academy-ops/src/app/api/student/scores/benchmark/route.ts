import { Subject } from "@prisma/client";
import { hasDatabaseConfig } from "@/lib/env";
import { getPrisma } from "@/lib/prisma";
import { SUBJECT_LABEL } from "@/lib/constants";
import { getStudentPortalViewer } from "@/lib/student-portal/service";

export const dynamic = "force-dynamic";

export interface BenchmarkSubjectRow {
  subject: Subject;
  subjectLabel: string;
  myAvg: number | null;
  classAvg: number | null;
  myPercentile: number | null; // 0-100, higher = better
  myRank: number | null;
  total: number;
}

export interface BenchmarkData {
  examNumber: string;
  studentName: string;
  periodId: number;
  periodName: string;
  myAvg: number | null;
  classAvg: number | null;
  classStdDev: number | null;
  myPercentile: number | null; // 0-100 (higher = better)
  myRank: number | null;
  totalStudents: number;
  studentsBelow: number;
  studentsAbove: number;
  subjectRows: BenchmarkSubjectRow[];
  // Score distribution: 10 buckets [0-9, 10-19, ..., 90-100]
  distribution: { bucket: number; count: number }[];
  myDistributionBucket: number | null;
}

function safeLabel(subject: Subject): string {
  return SUBJECT_LABEL[subject] ?? subject;
}

function average(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[], avg: number): number {
  if (arr.length < 2) return 0;
  const variance =
    arr.reduce((sum, x) => sum + Math.pow(x - avg, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

export async function GET() {
  if (!hasDatabaseConfig()) {
    return Response.json({ error: "DB not configured" }, { status: 503 });
  }

  const viewer = await getStudentPortalViewer();
  if (!viewer) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();

  // Find the active period (or most recent period with scores for this student)
  const period = await prisma.examPeriod.findFirst({
    where: {
      sessions: {
        some: {
          examType: viewer.examType,
          isCancelled: false,
          scores: {
            some: { examNumber: viewer.examNumber },
          },
        },
      },
    },
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
  });

  if (!period) {
    return Response.json({
      data: null,
    });
  }

  // Get all scores in this period for this exam type
  const allScores = await prisma.score.findMany({
    where: {
      session: {
        periodId: period.id,
        examType: viewer.examType,
        isCancelled: false,
      },
      finalScore: { not: null },
    },
    select: {
      examNumber: true,
      finalScore: true,
      session: {
        select: {
          subject: true,
        },
      },
    },
  });

  // Compute per-student averages (all subjects combined)
  const studentAvgMap = new Map<string, number[]>();
  for (const sc of allScores) {
    if (sc.finalScore === null) continue;
    const existing = studentAvgMap.get(sc.examNumber) ?? [];
    existing.push(sc.finalScore);
    studentAvgMap.set(sc.examNumber, existing);
  }

  // Student averages
  const studentAvgList: { examNumber: string; avg: number }[] = [];
  for (const [en, scores] of studentAvgMap.entries()) {
    const avg = average(scores);
    if (avg !== null) {
      studentAvgList.push({ examNumber: en, avg });
    }
  }
  studentAvgList.sort((a, b) => b.avg - a.avg);

  const totalStudents = studentAvgList.length;
  const myAvgEntry = studentAvgList.find((s) => s.examNumber === viewer.examNumber);
  const myAvg = myAvgEntry?.avg ?? null;

  const allAvgs = studentAvgList.map((s) => s.avg);
  const classAvg = average(allAvgs);
  const classStdDevVal =
    classAvg !== null && allAvgs.length > 1 ? stdDev(allAvgs, classAvg) : null;

  let myRank: number | null = null;
  let studentsBelow = 0;
  let studentsAbove = 0;
  let myPercentile: number | null = null;

  if (myAvg !== null) {
    // Rank = position in sorted desc list (1-indexed)
    myRank = studentAvgList.findIndex((s) => s.examNumber === viewer.examNumber) + 1;
    studentsBelow = studentAvgList.filter((s) => s.avg < myAvg).length;
    studentsAbove = studentAvgList.filter((s) => s.avg > myAvg).length;
    // Percentile: higher = better (students below / total * 100)
    myPercentile =
      totalStudents > 0
        ? Math.round((studentsBelow / totalStudents) * 100)
        : null;
  }

  // Per-subject analysis
  const subjects = Array.from(
    new Set(allScores.map((s) => s.session.subject))
  ) as Subject[];

  const subjectRows: BenchmarkSubjectRow[] = subjects.map((subject) => {
    const subjectScores = allScores.filter(
      (s) => s.session.subject === subject && s.finalScore !== null
    );

    // Per student avg for this subject
    const subjectStudentMap = new Map<string, number[]>();
    for (const sc of subjectScores) {
      if (sc.finalScore === null) continue;
      const arr = subjectStudentMap.get(sc.examNumber) ?? [];
      arr.push(sc.finalScore);
      subjectStudentMap.set(sc.examNumber, arr);
    }

    const subjectStudentAvgs: { examNumber: string; avg: number }[] = [];
    for (const [en, arr] of subjectStudentMap.entries()) {
      const avg = average(arr);
      if (avg !== null) subjectStudentAvgs.push({ examNumber: en, avg });
    }
    subjectStudentAvgs.sort((a, b) => b.avg - a.avg);

    const mySubjectEntry = subjectStudentAvgs.find(
      (s) => s.examNumber === viewer.examNumber
    );
    const mySubjectAvg = mySubjectEntry?.avg ?? null;
    const subjectClassAvg = average(subjectStudentAvgs.map((s) => s.avg));
    const subjectTotal = subjectStudentAvgs.length;

    let mySubjectPercentile: number | null = null;
    let mySubjectRank: number | null = null;
    if (mySubjectAvg !== null) {
      const below = subjectStudentAvgs.filter((s) => s.avg < mySubjectAvg).length;
      mySubjectPercentile =
        subjectTotal > 0 ? Math.round((below / subjectTotal) * 100) : null;
      mySubjectRank =
        subjectStudentAvgs.findIndex((s) => s.examNumber === viewer.examNumber) + 1;
    }

    return {
      subject,
      subjectLabel: safeLabel(subject),
      myAvg: mySubjectAvg,
      classAvg: subjectClassAvg,
      myPercentile: mySubjectPercentile,
      myRank: mySubjectRank,
      total: subjectTotal,
    };
  });

  // Score distribution (10 buckets: 0-9, 10-19, ... 90-100)
  const distribution = Array.from({ length: 10 }, (_, i) => ({ bucket: i * 10, count: 0 }));
  for (const s of studentAvgList) {
    const bucketIdx = Math.min(Math.floor(s.avg / 10), 9);
    distribution[bucketIdx]!.count += 1;
  }

  let myDistributionBucket: number | null = null;
  if (myAvg !== null) {
    myDistributionBucket = Math.min(Math.floor(myAvg / 10), 9) * 10;
  }

  const result: BenchmarkData = {
    examNumber: viewer.examNumber,
    studentName: viewer.name,
    periodId: period.id,
    periodName: period.name,
    myAvg,
    classAvg,
    classStdDev: classStdDevVal,
    myPercentile,
    myRank,
    totalStudents,
    studentsBelow,
    studentsAbove,
    subjectRows,
    distribution,
    myDistributionBucket,
  };

  return Response.json({ data: result });
}
