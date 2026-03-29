import { AdminRole, PassType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/graduates/[id]/snapshot — 스냅샷 목록 조회
export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;

  const record = await getPrisma().graduateRecord.findUnique({
    where: { id },
    include: { scoreSnapshots: { orderBy: { createdAt: "asc" } } },
  });
  if (!record) return NextResponse.json({ error: "합격 기록을 찾을 수 없습니다." }, { status: 404 });

  return NextResponse.json({ data: record.scoreSnapshots });
}

// POST /api/graduates/[id]/snapshot — 성적 스냅샷 생성
export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const body = await request.json();
  const { snapshotType } = body as { snapshotType: PassType };

  if (!snapshotType || !["WRITTEN_PASS", "FINAL_PASS", "APPOINTED"].includes(snapshotType)) {
    return NextResponse.json(
      { error: "snapshotType은 WRITTEN_PASS / FINAL_PASS / APPOINTED 중 하나여야 합니다." },
      { status: 400 },
    );
  }

  const prisma = getPrisma();

  const graduate = await prisma.graduateRecord.findUnique({
    where: { id },
    select: { id: true, examNumber: true, writtenPassDate: true, finalPassDate: true, appointedDate: true, enrolledMonths: true },
  });
  if (!graduate) return NextResponse.json({ error: "합격 기록을 찾을 수 없습니다." }, { status: 404 });

  // 해당 학생의 모든 성적 조회 (Score → ExamSession)
  const scores = await prisma.score.findMany({
    where: {
      examNumber: graduate.examNumber,
      finalScore: { not: null },
    },
    include: {
      session: {
        select: { subject: true, examDate: true },
      },
    },
    orderBy: { session: { examDate: "asc" } },
  });

  if (scores.length === 0) {
    // 성적 데이터 없이도 빈 스냅샷 생성 허용
    const snapshot = await prisma.graduateScoreSnapshot.upsert({
      where: {
        graduateId_snapshotType: {
          graduateId: id,
          snapshotType,
        },
      },
      update: {
        totalEnrolledMonths: graduate.enrolledMonths ?? 0,
        overallAverage: null,
        finalMonthAverage: null,
        subjectAverages: {},
        monthlyAverages: [],
        first3MonthsAvg: null,
        last3MonthsAvg: null,
      },
      create: {
        graduateId: id,
        snapshotType,
        examNumber: graduate.examNumber,
        totalEnrolledMonths: graduate.enrolledMonths ?? 0,
        overallAverage: null,
        finalMonthAverage: null,
        subjectAverages: {},
        monthlyAverages: [],
        first3MonthsAvg: null,
        last3MonthsAvg: null,
      },
    });
    return NextResponse.json({ data: snapshot }, { status: 201 });
  }

  // 월별 평균 계산
  const monthMap = new Map<string, number[]>();
  for (const s of scores) {
    if (s.finalScore == null) continue;
    const d = s.session.examDate;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthMap.has(key)) monthMap.set(key, []);
    monthMap.get(key)!.push(s.finalScore);
  }

  const monthlyAverages = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, vals]) => ({
      month,
      avg: Math.round((vals.reduce((sum, v) => sum + v, 0) / vals.length) * 10) / 10,
    }));

  // 전체 평균
  const allScores = scores.map((s) => s.finalScore as number);
  const overallAverage = allScores.length
    ? Math.round((allScores.reduce((sum, v) => sum + v, 0) / allScores.length) * 10) / 10
    : null;

  // 처음 3개월 평균
  const first3Keys = monthlyAverages.slice(0, 3).map((m) => m.month);
  const first3Scores = scores.filter((s) => {
    if (s.finalScore == null) return false;
    const d = s.session.examDate;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return first3Keys.includes(key);
  }).map((s) => s.finalScore as number);
  const first3MonthsAvg = first3Scores.length
    ? Math.round((first3Scores.reduce((sum, v) => sum + v, 0) / first3Scores.length) * 10) / 10
    : null;

  // 마지막 3개월 평균
  const last3Keys = monthlyAverages.slice(-3).map((m) => m.month);
  const last3Scores = scores.filter((s) => {
    if (s.finalScore == null) return false;
    const d = s.session.examDate;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return last3Keys.includes(key);
  }).map((s) => s.finalScore as number);
  const last3MonthsAvg = last3Scores.length
    ? Math.round((last3Scores.reduce((sum, v) => sum + v, 0) / last3Scores.length) * 10) / 10
    : null;

  // 마지막 1개월 평균
  const lastMonthKey = monthlyAverages.at(-1)?.month;
  const lastMonthScores = lastMonthKey
    ? scores.filter((s) => {
        if (s.finalScore == null) return false;
        const d = s.session.examDate;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        return key === lastMonthKey;
      }).map((s) => s.finalScore as number)
    : [];
  const finalMonthAverage = lastMonthScores.length
    ? Math.round((lastMonthScores.reduce((sum, v) => sum + v, 0) / lastMonthScores.length) * 10) / 10
    : null;

  // 과목별 평균
  const subjectMap = new Map<string, number[]>();
  for (const s of scores) {
    if (s.finalScore == null) continue;
    const sub = s.session.subject;
    if (!subjectMap.has(sub)) subjectMap.set(sub, []);
    subjectMap.get(sub)!.push(s.finalScore);
  }
  const subjectAverages: Record<string, number> = {};
  for (const [sub, vals] of subjectMap.entries()) {
    subjectAverages[sub] = Math.round((vals.reduce((sum, v) => sum + v, 0) / vals.length) * 10) / 10;
  }

  // 수강 기간 계산 (등록된 값 우선, 없으면 성적 기간으로 계산)
  let enrolledMonths = graduate.enrolledMonths;
  if (!enrolledMonths && monthlyAverages.length >= 2) {
    const first = monthlyAverages[0].month;
    const last = monthlyAverages[monthlyAverages.length - 1].month;
    const [fy, fm] = first.split("-").map(Number);
    const [ly, lm] = last.split("-").map(Number);
    enrolledMonths = (ly - fy) * 12 + (lm - fm) + 1;
  }

  const snapshot = await prisma.graduateScoreSnapshot.upsert({
    where: {
      graduateId_snapshotType: {
        graduateId: id,
        snapshotType,
      },
    },
    update: {
      totalEnrolledMonths: enrolledMonths ?? 0,
      overallAverage,
      finalMonthAverage,
      subjectAverages,
      monthlyAverages,
      first3MonthsAvg,
      last3MonthsAvg,
    },
    create: {
      graduateId: id,
      snapshotType,
      examNumber: graduate.examNumber,
      totalEnrolledMonths: enrolledMonths ?? 0,
      overallAverage,
      finalMonthAverage,
      subjectAverages,
      monthlyAverages,
      first3MonthsAvg,
      last3MonthsAvg,
    },
  });

  return NextResponse.json({ data: snapshot }, { status: 201 });
}

// DELETE /api/graduates/[id]/snapshot?type=WRITTEN_PASS — 스냅샷 삭제
export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const snapshotType = searchParams.get("type") as PassType | null;

  if (!snapshotType) return NextResponse.json({ error: "type 파라미터가 필요합니다." }, { status: 400 });

  await getPrisma().graduateScoreSnapshot.deleteMany({
    where: { graduateId: id, snapshotType },
  });

  return NextResponse.json({ data: { ok: true } });
}
