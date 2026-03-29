import { NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { getPointExportRows } from "@/lib/services/report.service";

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

  const pointDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "pointManagement",
  );

  if (pointDisabledError) {
    return NextResponse.json({ error: pointDisabledError }, { status: 403 });
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
    const rows = await getPointExportRows(params.division, dateFrom, dateTo);
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("points");

    worksheet.columns = [
      { header: "날짜", key: "date", width: 14 },
      { header: "학번", key: "studentNumber", width: 14 },
      { header: "이름", key: "studentName", width: 14 },
      { header: "구분", key: "categoryLabel", width: 12 },
      { header: "규칙", key: "ruleName", width: 20 },
      { header: "점수", key: "points", width: 10 },
      { header: "사유", key: "notes", width: 28 },
      { header: "처리자", key: "recordedByName", width: 16 },
    ];

    rows.forEach((row) => worksheet.addRow(row));

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${params.division}-points.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return toApiErrorResponse(error, "상벌점 내보내기에 실패했습니다.");
  }
}
