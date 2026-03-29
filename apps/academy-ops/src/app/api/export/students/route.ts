import { AdminRole, ExamType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  createCsvBuffer,
  createDownloadResponse,
  createXlsxBuffer,
  type ExportColumn,
  type ExportFormat,
} from "@/lib/export";
import { getStudentExportRows } from "@/lib/export/service";
import { requireApiAdmin } from "@/lib/api-auth";

type StudentExportRow = Awaited<ReturnType<typeof getStudentExportRows>>["rows"][number];

const columns: ExportColumn<StudentExportRow>[] = [
  { header: "수험번호", value: (row) => row.examNumber },
  { header: "이름", value: (row) => row.name },
  { header: "연락처", value: (row) => row.phone },
  { header: "기수", value: (row) => row.generation },
  { header: "반", value: (row) => row.className },
  { header: "직렬", value: (row) => row.examType },
  { header: "신규/기존", value: (row) => row.studentType },
  { header: "온라인 ID", value: (row) => row.onlineId },
  { header: "등록일", value: (row) => row.registeredAt },
  { header: "DB 생성일", value: (row) => row.createdAt },
  { header: "상태", value: (row) => row.isActive },
  { header: "현재 수강 강좌", value: (row) => row.activeCourse },
  { header: "포인트 잔액", value: (row) => row.pointBalance },
  { header: "메모", value: (row) => row.note },
];

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const format = (searchParams.get("format") as ExportFormat | null) ?? "xlsx";
  const generationValue = searchParams.get("generation");
  const result = await getStudentExportRows({
    examType: (searchParams.get("examType") as ExamType | null) ?? undefined,
    activeOnly: searchParams.get("activeOnly") !== "false",
    generation: generationValue ? Number(generationValue) : undefined,
  });
  const fileName = `${result.fileName}.${format}`;
  const buffer =
    format === "csv"
      ? createCsvBuffer(result.rows, columns)
      : createXlsxBuffer(result.rows, columns, result.sheetName);

  return createDownloadResponse(buffer, fileName, format);
}
