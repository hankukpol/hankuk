import { NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { getReportData } from "@/lib/services/report.service";

export async function GET(
  request: Request,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const reportingDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "reporting",
  );

  if (reportingDisabledError) {
    return NextResponse.json({ error: reportingDisabledError }, { status: 403 });
  }

  const url = new URL(request.url);
  const month = url.searchParams.get("month");

  if (!month) {
    return NextResponse.json({ error: "month가 필요합니다." }, { status: 400 });
  }

  try {
    const report = await getReportData(params.division, {
      period: "monthly",
      month,
    });
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("monthly");

    const showSeatColumn = report.featureFlags.seatManagement;
    const showAttendanceColumns = report.featureFlags.attendanceManagement;
    const showPointColumns = report.featureFlags.pointManagement;
    const showWarningColumn = report.featureFlags.warningManagement;
    const showExamColumn = report.featureFlags.examManagement;

    worksheet.columns = [
      { header: "학번", key: "studentNumber", width: 14 },
      { header: "이름", key: "studentName", width: 14 },
      ...(showSeatColumn ? [{ header: "좌석", key: "seatLabel", width: 12 }] : []),
      ...(showAttendanceColumns
        ? [
            { header: "출결률", key: "attendanceRate", width: 12 },
            { header: "출석", key: "presentCount", width: 10 },
            { header: "지각", key: "tardyCount", width: 10 },
            { header: "결석", key: "absentCount", width: 10 },
          ]
        : []),
      ...(showPointColumns
        ? [
            { header: "점수 변동", key: "pointDelta", width: 12 },
            { header: "누적 점수", key: "netPoints", width: 12 },
          ]
        : []),
      ...(showWarningColumn
        ? [{ header: "경고 단계", key: "warningStage", width: 14 }]
        : []),
      ...(showExamColumn ? [{ header: "최근 시험", key: "latestExam", width: 22 }] : []),
    ];

    report.studentRows.forEach((row) =>
      worksheet.addRow({
        studentNumber: row.studentNumber,
        studentName: row.studentName,
        ...(showSeatColumn ? { seatLabel: row.seatLabel } : {}),
        ...(showAttendanceColumns
          ? {
              attendanceRate: row.attendanceRate,
              presentCount: row.presentCount,
              tardyCount: row.tardyCount,
              absentCount: row.absentCount,
            }
          : {}),
        ...(showPointColumns
          ? {
              pointDelta: row.pointDelta,
              netPoints: row.netPoints,
            }
          : {}),
        ...(showWarningColumn ? { warningStage: row.warningStage } : {}),
        ...(showExamColumn
          ? {
              latestExam: row.latestExamLabel
                ? `${row.latestExamLabel} / ${row.latestExamTotal ?? "-"}`
                : "-",
            }
          : {}),
      }),
    );

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${params.division}-monthly.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return toApiErrorResponse(error, "월간 보고서 내보내기에 실패했습니다.");
  }
}
