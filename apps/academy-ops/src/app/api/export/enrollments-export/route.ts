import { AdminRole, EnrollmentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import {
  createCsvBuffer,
  createDownloadResponse,
  createXlsxBuffer,
  type ExportColumn,
  type ExportFormat,
} from "@/lib/export";
import {
  getEnrollmentStudentExportRows,
  type EnrollmentStudentExportFilters,
} from "@/lib/export/service";
import { requireApiAdmin } from "@/lib/api-auth";

type EnrollmentExportRow = Awaited<
  ReturnType<typeof getEnrollmentStudentExportRows>
>["rows"][number];

const COLUMNS: ExportColumn<EnrollmentExportRow>[] = [
  { header: "수험번호", value: (row) => row.examNumber },
  { header: "이름", value: (row) => row.name },
  { header: "연락처", value: (row) => row.phone },
  { header: "기수", value: (row) => row.generation },
  { header: "반", value: (row) => row.className },
  { header: "직렬", value: (row) => row.examType },
  { header: "신규/기존", value: (row) => row.studentType },
  { header: "활성여부", value: (row) => row.isActive },
  { header: "수강반", value: (row) => row.cohortName },
  { header: "수강유형", value: (row) => row.courseType },
  { header: "수강상태", value: (row) => row.enrollmentStatus },
  { header: "시작일", value: (row) => row.startDate },
  { header: "종료일", value: (row) => row.endDate },
  { header: "정가", value: (row) => row.regularFee },
  { header: "할인액", value: (row) => row.discountAmount },
  { header: "최종금액", value: (row) => row.finalFee },
  { header: "납부액", value: (row) => row.paidAmount },
  { header: "미납액", value: (row) => row.unpaidAmount },
  { header: "대기순번", value: (row) => row.waitlistOrder },
  { header: "등록일", value: (row) => row.enrolledAt },
];

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const format = (searchParams.get("format") as ExportFormat | null) ?? "xlsx";
  const cohortId = searchParams.get("cohortId") ?? undefined;
  const enrollmentStatusRaw = searchParams.get("enrollmentStatus");
  const startDateFrom = searchParams.get("startDateFrom") ?? undefined;
  const startDateTo = searchParams.get("startDateTo") ?? undefined;

  const validStatuses = Object.values(EnrollmentStatus) as string[];
  const enrollmentStatus =
    enrollmentStatusRaw && validStatuses.includes(enrollmentStatusRaw)
      ? (enrollmentStatusRaw as EnrollmentStatus)
      : undefined;

  const filters: EnrollmentStudentExportFilters = {
    cohortId,
    enrollmentStatus,
    startDateFrom,
    startDateTo,
  };

  const result = await getEnrollmentStudentExportRows(filters);
  const fileName = `${result.fileName}.${format}`;
  const buffer =
    format === "csv"
      ? createCsvBuffer(result.rows, COLUMNS)
      : createXlsxBuffer(result.rows, COLUMNS, result.sheetName);

  return createDownloadResponse(buffer, fileName, format);
}
