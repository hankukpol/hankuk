import { NextRequest, NextResponse } from "next/server";
import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const examNumber = searchParams.get("examNumber");
  const periodId = searchParams.get("periodId");

  if (!examNumber || !periodId) {
    return NextResponse.json({ error: "examNumber, periodId 필수" }, { status: 400 });
  }

  const periodIdNum = parseInt(periodId, 10);
  if (isNaN(periodIdNum)) {
    return NextResponse.json({ error: "periodId는 숫자여야 합니다." }, { status: 400 });
  }

  try {
    const scores = await getPrisma().score.findMany({
      where: {
        examNumber,
        session: { periodId: periodIdNum },
        finalScore: { not: null },
      },
      select: {
        finalScore: true,
        session: { select: { week: true, subject: true } },
      },
    });

    // Get all unique weeks
    const weeksSet = new Set(scores.map((s) => s.session.week));
    const weeks = Array.from(weeksSet).sort((a, b) => a - b);

    // Get all subjects present in data
    const subjectsSet = new Set(scores.map((s) => s.session.subject as string));
    const subjects = Array.from(subjectsSet);

    // Build data grid: subject -> week -> avg score
    const data: Record<string, Record<number, number | null>> = {};
    for (const subject of subjects) {
      data[subject] = {};
      for (const week of weeks) {
        const weekScores = scores.filter(
          (s) =>
            s.session.subject === subject &&
            s.session.week === week &&
            s.finalScore !== null,
        );
        if (weekScores.length > 0) {
          const avg =
            weekScores.reduce((sum, s) => sum + (s.finalScore ?? 0), 0) /
            weekScores.length;
          data[subject][week] = Math.round(avg * 10) / 10;
        } else {
          data[subject][week] = null;
        }
      }
    }

    return NextResponse.json({ subjects, weeks, data });
  } catch (error) {
    console.error("Failed to load subject heatmap data", error);
    return NextResponse.json(
      { error: "과목별 히트맵 데이터를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
