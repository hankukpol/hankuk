import { NextRequest, NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import {
  buildActivityExportFilename,
  getActivityLogData,
  type ActivityActionType,
} from "@/lib/services/report.service";
import {
  buildExcelResponse,
  createWorkbook,
  styleWorksheetHeader,
} from "@/lib/excel";

export async function GET(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "reporting",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  try {
    const activity = await getActivityLogData(params.division, {
      dateFrom: request.nextUrl.searchParams.get("dateFrom") ?? undefined,
      dateTo: request.nextUrl.searchParams.get("dateTo") ?? undefined,
      actorId: request.nextUrl.searchParams.get("actorId"),
      actionType:
        (request.nextUrl.searchParams.get("actionType") as ActivityActionType | null) ??
        null,
    });

    const workbook = await createWorkbook();
    const worksheet = workbook.addWorksheet("활동 로그");
    worksheet.columns = [
      { header: "시각", key: "occurredAt", width: 24 },
      { header: "유형", key: "actionLabel", width: 18 },
      { header: "처리자", key: "actorName", width: 18 },
      { header: "학번", key: "studentNumber", width: 18 },
      { header: "학생명", key: "studentName", width: 18 },
      { header: "내용", key: "detail", width: 60 },
    ];
    styleWorksheetHeader(worksheet);

    for (const item of activity.items) {
      worksheet.addRow({
        occurredAt: new Date(item.occurredAt).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
        }),
        actionLabel: item.actionLabel,
        actorName: item.actorName,
        studentNumber: item.studentNumber,
        studentName: item.studentName,
        detail: item.detail,
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();

    return buildExcelResponse(
      buildActivityExportFilename({
        dateFrom: activity.dateFrom,
        dateTo: activity.dateTo,
      }),
      buffer,
    );
  } catch (error) {
    return toApiErrorResponse(error, "활동 로그 내보내기에 실패했습니다.");
  }
}
