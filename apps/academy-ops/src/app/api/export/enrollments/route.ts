import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  createCsvBuffer,
  createDownloadResponse,
  createXlsxBuffer,
  type ExportColumn,
  type ExportFormat,
} from "@/lib/export";
import { listPeriodEnrollments } from "@/lib/periods/enrollments";
import { getPrisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/api-auth";
import { EXAM_TYPE_LABEL } from "@/lib/constants";

type EnrollmentRow = Awaited<ReturnType<typeof listPeriodEnrollments>>[number];

const columns: ExportColumn<EnrollmentRow>[] = [
  { header: "수험번호", value: (row) => row.student.examNumber },
  { header: "이름", value: (row) => row.student.name },
  { header: "직렬", value: (row) => EXAM_TYPE_LABEL[row.student.examType] },
  { header: "활성", value: (row) => (row.student.isActive ? "O" : "X") },
  {
    header: "등록일",
    value: (row) => row.enrolledAt.toLocaleDateString("ko-KR"),
  },
];

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const format = (searchParams.get("format") as ExportFormat | null) ?? "xlsx";
  const periodIdValue = searchParams.get("periodId");

  if (!periodIdValue) {
    return NextResponse.json({ error: "시험 기간을 선택하세요." }, { status: 400 });
  }

  const periodId = Number(periodIdValue);
  const period = await getPrisma().examPeriod.findUnique({ where: { id: periodId } });

  if (!period) {
    return NextResponse.json({ error: "시험 기간을 찾을 수 없습니다." }, { status: 404 });
  }

  const enrollments = await listPeriodEnrollments(periodId);
  const fileName = `수강생명단_${period.name}.${format}`;
  const buffer =
    format === "csv"
      ? createCsvBuffer(enrollments, columns)
      : createXlsxBuffer(enrollments, columns, "수강생명단");

  return createDownloadResponse(buffer, fileName, format);
}
