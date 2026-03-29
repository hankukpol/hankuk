import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { createCsvBuffer, createDownloadResponse, type ExportColumn } from "@/lib/export";
import { ACADEMY_TYPE_LABEL, getSuperDashboardStats } from "@/lib/super-admin";

type DashboardExportRow = {
  period: string;
  academyCode: string;
  academyName: string;
  academyType: string;
  status: string;
  studentCount: number;
  activeStudentCount: number;
  newStudentCount: number;
  monthlyRevenue: number;
  unpaidStudentCount: number;
  attendanceRate: string;
};

const COLUMNS: ExportColumn<DashboardExportRow>[] = [
  { header: "조회 범위", value: (row) => row.period },
  { header: "지점 코드", value: (row) => row.academyCode },
  { header: "지점명", value: (row) => row.academyName },
  { header: "유형", value: (row) => row.academyType },
  { header: "상태", value: (row) => row.status },
  { header: "전체 학생", value: (row) => row.studentCount },
  { header: "활성 학생", value: (row) => row.activeStudentCount },
  { header: "기간 신규", value: (row) => row.newStudentCount },
  { header: "기간 수납", value: (row) => row.monthlyRevenue },
  { header: "미납 학생", value: (row) => row.unpaidStudentCount },
  { header: "출석률", value: (row) => row.attendanceRate },
];

function readQueryParam(request: NextRequest, key: string) {
  return request.nextUrl.searchParams.get(key);
}

function formatAttendanceRate(rate: number | null) {
  if (rate === null) {
    return "기록 없음";
  }

  return `${rate.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const stats = await getSuperDashboardStats({
    preset: readQueryParam(request, "preset"),
    from: readQueryParam(request, "from"),
    to: readQueryParam(request, "to"),
    month: readQueryParam(request, "month"),
  });

  const rows: DashboardExportRow[] = [
    {
      period: stats.filter.rangeLabel,
      academyCode: "TOTAL",
      academyName: "전체 합계",
      academyType: "-",
      status: `${stats.totals.activeAcademyCount}/${stats.totals.academyCount}`,
      studentCount: stats.totals.studentCount,
      activeStudentCount: stats.totals.activeStudentCount,
      newStudentCount: stats.totals.newStudentCount,
      monthlyRevenue: stats.totals.monthlyRevenue,
      unpaidStudentCount: stats.totals.unpaidStudentCount,
      attendanceRate: formatAttendanceRate(stats.totals.attendanceRate),
    },
    ...stats.academies.map((academy) => ({
      period: stats.filter.rangeLabel,
      academyCode: academy.academyCode,
      academyName: academy.academyName,
      academyType: ACADEMY_TYPE_LABEL[academy.academyType],
      status: academy.isActive ? "운영 중" : "비활성",
      studentCount: academy.studentCount,
      activeStudentCount: academy.activeStudentCount,
      newStudentCount: academy.newStudentCount,
      monthlyRevenue: academy.monthlyRevenue,
      unpaidStudentCount: academy.unpaidStudentCount,
      attendanceRate: formatAttendanceRate(academy.attendanceRate),
    })),
  ];

  const buffer = createCsvBuffer(rows, COLUMNS);
  const fileName = `전지점_통합KPI_${stats.filter.fromDateValue}_${stats.filter.toDateValue}.csv`;
  return createDownloadResponse(buffer, fileName, "csv");
}
