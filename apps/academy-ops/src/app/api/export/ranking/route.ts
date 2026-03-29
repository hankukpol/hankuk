import { AdminRole, ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  createCsvBuffer,
  createDownloadResponse,
  createXlsxBuffer,
  type ExportColumn,
  type ExportFormat,
} from "@/lib/export";
import { getIntegratedResults } from "@/lib/analytics/service";
import { requireApiAdmin } from "@/lib/api-auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";

type RankingRow = Awaited<ReturnType<typeof getIntegratedResults>>["rows"][number];

const columns: ExportColumn<RankingRow>[] = [
  { header: "수험번호", value: (row) => row.examNumber },
  { header: "이름", value: (row) => row.name },
  { header: "구분", value: (row) => (row.studentType === "NEW" ? "신규생" : "기존생") },
  { header: "활성", value: (row) => (row.isActive ? "O" : "X") },
  { header: "평균", value: (row) => row.average },
  { header: "전체 석차", value: (row) => row.overallRank },
  { header: "신규생 석차", value: (row) => row.newRank },
  { header: "참여율(%)", value: (row) => row.participationRate },
  { header: "개근", value: (row) => (row.perfectAttendance ? "O" : "X") },
];

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const format = (searchParams.get("format") as ExportFormat | null) ?? "xlsx";
  const periodIdValue = searchParams.get("periodId");
  const examType = (searchParams.get("examType") as ExamType | null) ?? ExamType.GONGCHAE;
  const view = (searchParams.get("view") as "overall" | "new" | null) ?? "overall";

  if (!periodIdValue) {
    return NextResponse.json({ error: "시험 기간을 선택하세요." }, { status: 400 });
  }

  const result = await getIntegratedResults(Number(periodIdValue), examType, view, {
    includeProfiles: false,
  });
  const examTypeLabel = EXAM_TYPE_LABEL[examType];
  const viewLabel = view === "new" ? "_신규생" : "";
  const fileName = `석차_${result.period.name}_${examTypeLabel}${viewLabel}.${format}`;
  const sheetName = `${examTypeLabel}${viewLabel}`;
  const buffer =
    format === "csv"
      ? createCsvBuffer(result.rows, columns)
      : createXlsxBuffer(result.rows, columns, sheetName);

  return createDownloadResponse(buffer, fileName, format);
}
