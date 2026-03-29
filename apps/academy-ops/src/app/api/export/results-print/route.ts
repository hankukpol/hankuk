import { AdminRole, ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getIntegratedResults, getMonthlyResults, getWeeklyResults } from "@/lib/analytics/service";
import { formatTuesdayWeekLabel } from "@/lib/analytics/week";
import { requireApiAdmin } from "@/lib/api-auth";
import { createDownloadResponse } from "@/lib/export";

const EXAM_TYPE_LABEL: Record<ExamType, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

const PRINT_MODE = ["weekly", "monthly", "integrated"] as const;
export const runtime = "nodejs";

function readExamType(value: string | null) {
  return value && Object.values(ExamType).includes(value as ExamType)
    ? (value as ExamType)
    : ExamType.GONGCHAE;
}

function readView(value: string | null) {
  return value === "new" ? "new" : "overall";
}

function readMode(value: string | null) {
  return value && PRINT_MODE.includes(value as (typeof PRINT_MODE)[number])
    ? value
    : null;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const mode = readMode(searchParams.get("mode"));
  const periodIdValue = searchParams.get("periodId");
  const examType = readExamType(searchParams.get("examType"));
  const view = readView(searchParams.get("view"));

  if (!periodIdValue) {
    return NextResponse.json({ error: "시험 기간을 선택해 주세요." }, { status: 400 });
  }

  const periodId = Number(periodIdValue);
  const examTypeLabel = EXAM_TYPE_LABEL[examType];
  const viewLabel = view === "new" ? "_신규생" : "";

  if (mode === "weekly") {
    const weekKey = searchParams.get("weekKey");

    if (!weekKey) {
      return NextResponse.json({ error: "주간 기준을 선택해 주세요." }, { status: 400 });
    }

    const result = await getWeeklyResults(periodId, examType, weekKey, view, {
      includeRankingRows: false,
    });
    const { createWeeklyResultsPrintWorkbook } = await import("@/lib/results-print-export");
    const buffer = await createWeeklyResultsPrintWorkbook(result, examType, view);
    const fileName = `주간성적표_${result.period.name}_${examTypeLabel}_${formatTuesdayWeekLabel(
      weekKey,
    )}${viewLabel}.xlsx`;
    return createDownloadResponse(buffer, fileName, "xlsx");
  }

  if (mode === "monthly") {
    const fromWeekKey = searchParams.get("fromWeekKey");
    const toWeekKey = searchParams.get("toWeekKey");

    if (!fromWeekKey || !toWeekKey) {
      return NextResponse.json({ error: "주차 범위를 선택해 주세요." }, { status: 400 });
    }

    const label = `${formatTuesdayWeekLabel(fromWeekKey)} ~ ${formatTuesdayWeekLabel(toWeekKey)}`;
    const result = await getMonthlyResults(periodId, examType, fromWeekKey, toWeekKey, view, {
      includeRankingRows: false,
    });
    const { createMonthlyResultsPrintWorkbook } = await import("@/lib/results-print-export");
    const buffer = await createMonthlyResultsPrintWorkbook(result, examType, label, view);
    const fileName = `월간성적표_${result.period.name}_${examTypeLabel}_${label}${viewLabel}.xlsx`;
    return createDownloadResponse(buffer, fileName, "xlsx");
  }

  if (mode === "integrated") {
    const result = await getIntegratedResults(periodId, examType, view, {
      includeRankingRows: false,
    });
    const { createIntegratedResultsPrintWorkbook } = await import("@/lib/results-print-export");
    const buffer = await createIntegratedResultsPrintWorkbook(result, examType, view);
    const fileName = `통합2개월성적표_${result.period.name}_${examTypeLabel}${viewLabel}.xlsx`;
    return createDownloadResponse(buffer, fileName, "xlsx");
  }

  return NextResponse.json({ error: "지원하지 않는 출력 모드입니다." }, { status: 400 });
}
