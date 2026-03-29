import { AdminRole, ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  createCsvBuffer,
  createDownloadResponse,
  createXlsxBuffer,
  type ExportColumn,
  type ExportFormat,
} from "@/lib/export";
import { getScoreExportRows } from "@/lib/export/service";
import { requireApiAdmin } from "@/lib/api-auth";

type ScoreExportRow = Awaited<ReturnType<typeof getScoreExportRows>>["rows"][number];

const columns: ExportColumn<ScoreExportRow>[] = [
  { header: "시험 기간", value: (row) => row.periodName },
  { header: "시험일", value: (row) => row.examDate },
  { header: "직렬", value: (row) => row.examType },
  { header: "주차", value: (row) => row.week },
  { header: "과목", value: (row) => row.subject },
  { header: "수험번호", value: (row) => row.examNumber },
  { header: "이름", value: (row) => row.studentName },
  { header: "온라인 ID", value: (row) => row.onlineId },
  { header: "응시 유형", value: (row) => row.attendType },
  { header: "입력 방식", value: (row) => row.sourceType },
  { header: "원점수", value: (row) => row.rawScore },
  { header: "OX/추가", value: (row) => row.oxScore },
  { header: "최종점수", value: (row) => row.finalScore },
  { header: "메모", value: (row) => row.note },
];

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const format = (searchParams.get("format") as ExportFormat | null) ?? "xlsx";
  const periodIdValue = searchParams.get("periodId");
  const result = await getScoreExportRows({
    periodId: periodIdValue ? Number(periodIdValue) : undefined,
    examType: (searchParams.get("examType") as ExamType | null) ?? undefined,
  });
  const fileName = `${result.fileName}.${format}`;
  const buffer =
    format === "csv"
      ? createCsvBuffer(result.rows, columns)
      : createXlsxBuffer(result.rows, columns, result.sheetName);

  return createDownloadResponse(buffer, fileName, format);
}
