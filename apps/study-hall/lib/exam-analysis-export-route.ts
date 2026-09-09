import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "./api-auth";
import { getDivisionFeatureDisabledError } from "./division-feature-guard";
import { toApiErrorResponse } from "./api-error-response";
import { examAnalysisExportSchema } from "./exam-analysis-export-schemas";
import { getExamAnalysisExportRows } from "./services/exam-analysis-export.service";

const privateHeaders = { "Cache-Control": "private, no-store" };

/** ExcelJS is loaded only by this server-side download handler. */
export async function handleExamAnalysisExport(request: NextRequest, division: string) {
  try {
    const auth = await requireApiAuth(division, ["ADMIN", "SUPER_ADMIN"]);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: privateHeaders });
    for (const feature of ["reporting", "examManagement"] as const) {
      const disabled = await getDivisionFeatureDisabledError(division, feature);
      if (disabled) return NextResponse.json({ error: disabled }, { status: 403, headers: privateHeaders });
    }
    const input = examAnalysisExportSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const { sheets } = await getExamAnalysisExportRows(division, input);
    const { Workbook } = await import("exceljs");
    const workbook = new Workbook();
    workbook.creator = "Study Hall";
    for (const data of sheets) {
      const sheet = workbook.addWorksheet(data.name);
      sheet.addRow(data.header);
      // Values are scalar text/numbers, never formula objects. Leading '=' stays literal text.
      sheet.addRows(data.rows);
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.getRow(1).font = { bold: true };
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: data.header.length } };
      sheet.columns.forEach(column => { column.width = 20; });
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const date = input.kind === "regular" ? input.examDate : `${input.from}_${input.to}`;
    return new NextResponse(new Uint8Array(buffer), { headers: {
      ...privateHeaders,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="exam-analysis-${input.kind}-${date}.xlsx"`,
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    return toApiErrorResponse(error, "성적 분석 파일을 만들지 못했습니다.", 500);
  }
}
