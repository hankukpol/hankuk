import { NextRequest, NextResponse } from "next/server";

import { buildDelimitedLine, buildExcelFriendlyCsv } from "@/lib/csv";
import { createCp949CsvResponse } from "@/lib/csv-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";

export async function GET(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN", "ASSISTANT"]);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "examManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const examTypeId = request.nextUrl.searchParams.get("examTypeId");
  const subjectId = request.nextUrl.searchParams.get("subjectId");
  const date = request.nextUrl.searchParams.get("date");

  if (!examTypeId || !subjectId || !date) {
    return NextResponse.json(
      { error: "examTypeId, subjectId, date 파라미터가 필요합니다." },
      { status: 400 },
    );
  }

  const header = buildDelimitedLine(["수험번호", "이름", "점수", "비고"]);
  const blankRow = buildDelimitedLine(["", "", "", ""]);
  const content = buildExcelFriendlyCsv([header, blankRow]);
  const dateLabel = date.replaceAll("-", "");

  return createCp949CsvResponse(content, `morning-exam-template_${dateLabel}.csv`);
}
