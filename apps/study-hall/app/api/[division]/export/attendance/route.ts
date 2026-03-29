import { NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { getAttendanceExportRows } from "@/lib/services/report.service";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";

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

  const attendanceDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "attendanceManagement",
  );

  if (attendanceDisabledError) {
    return NextResponse.json({ error: attendanceDisabledError }, { status: 403 });
  }

  const url = new URL(request.url);
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");

  if (!dateFrom || !dateTo) {
    return NextResponse.json(
      { error: "dateFrom과 dateTo가 필요합니다." },
      { status: 400 },
    );
  }

  try {
    const [rows, featureSettings] = await Promise.all([
      getAttendanceExportRows(params.division, dateFrom, dateTo),
      getDivisionFeatureSettings(params.division),
    ]);
    const showSeatColumn = featureSettings.featureFlags.seatManagement;
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("attendance");

    worksheet.columns = [
      { header: "날짜", key: "date", width: 14 },
      { header: "학번", key: "studentNumber", width: 14 },
      { header: "이름", key: "studentName", width: 14 },
      ...(showSeatColumn ? [{ header: "좌석", key: "seatLabel", width: 12 }] : []),
      { header: "교시", key: "periodName", width: 14 },
      { header: "상태", key: "status", width: 14 },
      { header: "사유", key: "reason", width: 28 },
    ];

    rows
      .filter(
        (
          row,
        ): row is NonNullable<(typeof rows)[number]> => row !== null,
      )
      .forEach((row) =>
        worksheet.addRow({
          date: row.date,
          studentNumber: row.studentNumber,
          studentName: row.studentName,
          ...(showSeatColumn ? { seatLabel: row.seatLabel } : {}),
          periodName: row.periodName,
          status: row.status,
          reason: row.reason,
        }),
      );

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${params.division}-attendance.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return toApiErrorResponse(error, "출결 내보내기에 실패했습니다.");
  }
}
