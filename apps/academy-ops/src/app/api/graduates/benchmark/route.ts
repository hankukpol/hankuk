import { AdminRole, ExamType, PassType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/graduates/benchmark?examType=GONGCHAE&passType=FINAL_PASS
// 합격자 성적 벤치마크 데이터 집계
export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const examType = searchParams.get("examType") as ExamType | null;
  const passType = (searchParams.get("passType") as PassType | null) ?? "FINAL_PASS";

  const prisma = getPrisma();

  // 합격자 레코드 조회 (스냅샷 포함)
  const graduates = await prisma.graduateRecord.findMany({
    where: {
      passType: passType as PassType,
      ...(examType ? { student: { examType: examType } } : {}),
    },
    include: {
      scoreSnapshots: {
        where: { snapshotType: passType as PassType },
      },
      student: { select: { examType: true } },
    },
  });

  const totalCount = graduates.length;

  // 스냅샷이 있는 합격자만 분석
  const withSnapshot = graduates.filter((g) => g.scoreSnapshots.length > 0);

  // 수강 기간 분포
  const durationBuckets = new Map<string, number>();
  const durationLabels = ["6개월 이하", "7~12개월", "13~18개월", "19~24개월", "24개월 초과"];
  for (const label of durationLabels) durationBuckets.set(label, 0);

  let totalMonths = 0;
  let minMonths = Infinity;
  let maxMonths = 0;

  for (const g of withSnapshot) {
    const months = g.scoreSnapshots[0].totalEnrolledMonths;
    totalMonths += months;
    if (months < minMonths) minMonths = months;
    if (months > maxMonths) maxMonths = months;

    let bucket: string;
    if (months <= 6) bucket = "6개월 이하";
    else if (months <= 12) bucket = "7~12개월";
    else if (months <= 18) bucket = "13~18개월";
    else if (months <= 24) bucket = "19~24개월";
    else bucket = "24개월 초과";

    durationBuckets.set(bucket, (durationBuckets.get(bucket) ?? 0) + 1);
  }

  const enrollMonthDist = durationLabels.map((label) => {
    const count = durationBuckets.get(label) ?? 0;
    return {
      label,
      count,
      percentage: withSnapshot.length > 0 ? Math.round((count / withSnapshot.length) * 100) : 0,
    };
  });

  const avgEnrolledMonths = withSnapshot.length > 0 ? Math.round(totalMonths / withSnapshot.length) : 0;

  // 수강 시작 후 N개월 시점별 합격자 평균 점수 집계
  // monthlyAverages: [{month: "2025-01", avg: 85.5}, ...]
  const monthFromStartMap = new Map<number, number[]>();

  for (const g of withSnapshot) {
    const snap = g.scoreSnapshots[0];
    const monthly = snap.monthlyAverages as Array<{ month: string; avg: number }>;
    if (!Array.isArray(monthly) || monthly.length === 0) continue;

    // 첫 월을 기준으로 monthFromStart 계산
    const firstMonth = monthly[0].month;
    const [fy, fm] = firstMonth.split("-").map(Number);

    for (const entry of monthly) {
      const [y, m] = entry.month.split("-").map(Number);
      const monthFromStart = (y - fy) * 12 + (m - fm) + 1;
      if (!monthFromStartMap.has(monthFromStart)) monthFromStartMap.set(monthFromStart, []);
      monthFromStartMap.get(monthFromStart)!.push(entry.avg);
    }
  }

  const avgByMonth = Array.from(monthFromStartMap.entries())
    .filter(([month]) => month <= 30)
    .sort(([a], [b]) => a - b)
    .map(([monthFromStart, scores]) => {
      const sorted = [...scores].sort((a, b) => a - b);
      const avg = Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10;
      const q1 = sorted[Math.floor(sorted.length * 0.25)] ?? avg;
      const q3 = sorted[Math.floor(sorted.length * 0.75)] ?? avg;
      return {
        monthFromStart,
        avg,
        top25: Math.round(q3 * 10) / 10,
        bottom25: Math.round(q1 * 10) / 10,
        count: scores.length,
      };
    });

  // 과목별 합격자 평균
  const subjectSums = new Map<string, { sum: number; count: number }>();
  for (const g of withSnapshot) {
    const snap = g.scoreSnapshots[0];
    const subs = snap.subjectAverages as Record<string, number>;
    for (const [sub, avg] of Object.entries(subs)) {
      if (!subjectSums.has(sub)) subjectSums.set(sub, { sum: 0, count: 0 });
      const cur = subjectSums.get(sub)!;
      cur.sum += avg;
      cur.count += 1;
    }
  }

  const subjectAvgs = Array.from(subjectSums.entries()).map(([subject, { sum, count }]) => ({
    subject,
    avg: Math.round((sum / count) * 10) / 10,
    count,
  }));

  return NextResponse.json({
    data: {
      totalCount,
      withSnapshotCount: withSnapshot.length,
      avgEnrolledMonths,
      minMonths: minMonths === Infinity ? 0 : minMonths,
      maxMonths,
      enrollMonthDist,
      avgByMonth,
      subjectAvgs,
    },
  });
}
