import { getPrisma } from "@/lib/prisma";
import { PassType } from "@prisma/client";

export type CounselingBenchmarkPoint = {
  passType: PassType;
  label: string;
  count: number;
  pct: number; // percentage of totalGraduates
  avgEnrolledMonths: number;
  subjectAverages: Record<string, number>;
};

export type GraduateBenchmarkData = {
  totalGraduates: number;
  writtenPassCount: number;
  finalPassCount: number;
  appointedCount: number;
  passRate: number; // finalPass / total * 100
  avgEnrolledMonths: number;
  medianEnrolledMonths: number;
  subjectAverages: Record<string, number>; // subject -> avg score at time of pass
  monthlyPassCounts: Array<{ year: number; month: number; count: number; passType: string }>;
  enrolledMonthsDistribution: Array<{ months: string; count: number }>; // histogram
  // counseling-specific extras
  passTypeBreakdown: CounselingBenchmarkPoint[];
  durationBrackets: Array<{ label: string; count: number; pct: number }>; // 3/6/12 month brackets
  recentGraduates: Array<{
    id: string;
    name: string;
    examNumber: string;
    examName: string;
    passType: PassType;
    enrolledMonths: number | null;
    passDate: string | null;
  }>;
};

function calcMedian(sortedArr: number[]): number {
  if (sortedArr.length === 0) return 0;
  const mid = Math.floor(sortedArr.length / 2);
  if (sortedArr.length % 2 === 0) {
    return ((sortedArr[mid - 1] ?? 0) + (sortedArr[mid] ?? 0)) / 2;
  }
  return sortedArr[mid] ?? 0;
}

function calcSubjectAveragesForRecords(
  records: Array<{
    passType: PassType;
    scoreSnapshots: Array<{ snapshotType: PassType; subjectAverages: unknown }>;
  }>
): Record<string, number> {
  const sums: Record<string, { sum: number; count: number }> = {};
  for (const record of records) {
    const snap =
      record.scoreSnapshots.find((s) => s.snapshotType === record.passType) ??
      record.scoreSnapshots[0];
    if (!snap) continue;
    const subj = snap.subjectAverages as Record<string, number>;
    for (const [subject, avg] of Object.entries(subj)) {
      if (typeof avg !== "number") continue;
      if (!sums[subject]) sums[subject] = { sum: 0, count: 0 };
      sums[subject].sum += avg;
      sums[subject].count += 1;
    }
  }
  const result: Record<string, number> = {};
  for (const [subject, { sum, count }] of Object.entries(sums)) {
    result[subject] = Math.round((sum / count) * 10) / 10;
  }
  return result;
}

export async function getGraduateBenchmarkData(): Promise<GraduateBenchmarkData> {
  const prisma = getPrisma();

  const records = await prisma.graduateRecord.findMany({
    include: {
      student: { select: { name: true } },
      scoreSnapshots: {
        select: {
          snapshotType: true,
          totalEnrolledMonths: true,
          subjectAverages: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Counts by passType
  const writtenPassCount = records.filter((r) => r.passType === PassType.WRITTEN_PASS).length;
  const finalPassCount = records.filter((r) => r.passType === PassType.FINAL_PASS).length;
  const appointedCount = records.filter((r) => r.passType === PassType.APPOINTED).length;
  const totalGraduates = records.length;
  const passRate =
    totalGraduates > 0
      ? Math.round(((finalPassCount + appointedCount) / totalGraduates) * 100)
      : 0;

  // Average and median enrolled months (from GraduateRecord.enrolledMonths)
  const monthsArr = records
    .map((r) => r.enrolledMonths)
    .filter((m): m is number => typeof m === "number");
  const sortedMonths = [...monthsArr].sort((a, b) => a - b);
  const avgEnrolledMonths =
    monthsArr.length > 0
      ? Math.round(monthsArr.reduce((s, m) => s + m, 0) / monthsArr.length)
      : 0;
  const medianEnrolledMonths = Math.round(calcMedian(sortedMonths));

  // Subject averages (all records)
  const subjectAverages = calcSubjectAveragesForRecords(records);

  // Monthly pass counts by createdAt
  const monthlyMap: Record<string, Record<string, number>> = {};
  for (const record of records) {
    const d = record.createdAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyMap[key]) monthlyMap[key] = {};
    const pt = record.passType as string;
    monthlyMap[key][pt] = (monthlyMap[key][pt] ?? 0) + 1;
  }
  const monthlyPassCounts: GraduateBenchmarkData["monthlyPassCounts"] = [];
  for (const [key, typeCounts] of Object.entries(monthlyMap)) {
    const [yearStr, monthStr] = key.split("-");
    const year = Number(yearStr);
    const month = Number(monthStr);
    for (const [passType, count] of Object.entries(typeCounts)) {
      monthlyPassCounts.push({ year, month, count, passType });
    }
  }
  monthlyPassCounts.sort((a, b) => a.year - b.year || a.month - b.month);

  // Histogram: enrolled months distribution
  const buckets: Array<{ months: string; count: number }> = [
    { months: "0~3개월", count: 0 },
    { months: "3~6개월", count: 0 },
    { months: "6~12개월", count: 0 },
    { months: "12~24개월", count: 0 },
    { months: "24개월+", count: 0 },
  ];
  for (const m of monthsArr) {
    if (m < 3) buckets[0].count += 1;
    else if (m < 6) buckets[1].count += 1;
    else if (m < 12) buckets[2].count += 1;
    else if (m < 24) buckets[3].count += 1;
    else buckets[4].count += 1;
  }

  // ── Counseling-specific: passType breakdown ───────────────────────────────
  const PASS_TYPE_LABEL_MAP: Record<PassType, string> = {
    WRITTEN_PASS: "필기합격",
    FINAL_PASS: "최종합격",
    APPOINTED: "임용",
    WRITTEN_FAIL: "필기불합격",
    FINAL_FAIL: "최종불합격",
  };

  const passTypeBreakdown: CounselingBenchmarkPoint[] = [];
  const passTypeOrder: PassType[] = [PassType.WRITTEN_PASS, PassType.FINAL_PASS, PassType.APPOINTED];
  for (const pt of passTypeOrder) {
    const group = records.filter((r) => r.passType === pt);
    if (group.length === 0) continue;
    const groupMonths = group.map((r) => r.enrolledMonths).filter((m): m is number => typeof m === "number");
    const groupAvgMonths =
      groupMonths.length > 0
        ? Math.round(groupMonths.reduce((s, m) => s + m, 0) / groupMonths.length)
        : 0;
    passTypeBreakdown.push({
      passType: pt,
      label: PASS_TYPE_LABEL_MAP[pt],
      count: group.length,
      pct: totalGraduates > 0 ? Math.round((group.length / totalGraduates) * 100) : 0,
      avgEnrolledMonths: groupAvgMonths,
      subjectAverages: calcSubjectAveragesForRecords(group),
    });
  }

  // ── Counseling-specific: study duration brackets (3 simple brackets) ──────
  const bracket3 = monthsArr.filter((m) => m <= 3).length;
  const bracket6 = monthsArr.filter((m) => m > 3 && m <= 6).length;
  const bracket12 = monthsArr.filter((m) => m > 6 && m <= 12).length;
  const bracketOver12 = monthsArr.filter((m) => m > 12).length;
  const totalWithMonths = monthsArr.length;
  const durationBrackets: GraduateBenchmarkData["durationBrackets"] = [
    {
      label: "3개월 이하",
      count: bracket3,
      pct: totalWithMonths > 0 ? Math.round((bracket3 / totalWithMonths) * 100) : 0,
    },
    {
      label: "4~6개월",
      count: bracket6,
      pct: totalWithMonths > 0 ? Math.round((bracket6 / totalWithMonths) * 100) : 0,
    },
    {
      label: "7~12개월",
      count: bracket12,
      pct: totalWithMonths > 0 ? Math.round((bracket12 / totalWithMonths) * 100) : 0,
    },
    {
      label: "12개월 초과",
      count: bracketOver12,
      pct: totalWithMonths > 0 ? Math.round((bracketOver12 / totalWithMonths) * 100) : 0,
    },
  ];

  // Recent graduates (last 20)
  const recentGraduates: GraduateBenchmarkData["recentGraduates"] = records.slice(0, 20).map((r) => {
    const passDate =
      r.finalPassDate?.toISOString() ??
      r.writtenPassDate?.toISOString() ??
      r.appointedDate?.toISOString() ??
      r.createdAt.toISOString();
    return {
      id: r.id,
      name: r.student.name,
      examNumber: r.examNumber,
      examName: r.examName,
      passType: r.passType,
      enrolledMonths: r.enrolledMonths,
      passDate: passDate.slice(0, 10),
    };
  });

  return {
    totalGraduates,
    writtenPassCount,
    finalPassCount,
    appointedCount,
    passRate,
    avgEnrolledMonths,
    medianEnrolledMonths,
    subjectAverages,
    monthlyPassCounts,
    enrolledMonthsDistribution: buckets,
    passTypeBreakdown,
    durationBrackets,
    recentGraduates,
  };
}
