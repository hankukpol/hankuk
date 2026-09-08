import { withApiHandler } from "@/lib/api-handler";
import { NextRequest, NextResponse } from "next/server";

import { buildDelimitedLine, buildExcelFriendlyCsv } from "@/lib/csv";
import { createCp949CsvResponse } from "@/lib/csv-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { getExamScoreSheet } from "@/lib/services/exam.service";

async function handleGET(
  request: NextRequest,
  { params }: { params: { division: string } },
) {
  const auth = await requireApiAuth(params.division, ["ADMIN", "SUPER_ADMIN"]);

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
  const examRound = Number(request.nextUrl.searchParams.get("examRound") ?? "1");

  if (!examTypeId || !Number.isInteger(examRound) || examRound < 1) {
    return NextResponse.json(
      { error: "examTypeId, examRound 파라미터를 확인해주세요." },
      { status: 400 },
    );
  }

  const sheet = await getExamScoreSheet(params.division, examTypeId, examRound);
  const subjects = sheet.subjects.filter((subject) => subject.isActive !== false);
  const header = buildDelimitedLine(["수험번호", ...subjects.map((subject) => subject.name)]);
  const rows = sheet.rows.map((row) =>
    buildDelimitedLine([
      row.studentNumber,
      ...subjects.map(() => ""),
    ]),
  );
  const content = buildExcelFriendlyCsv([header, ...rows]);

  return createCp949CsvResponse(content, `exam-score-template_round-${examRound}.csv`);
}

export const GET = withApiHandler(handleGET, "성적 입력 양식을 불러오지 못했습니다.");
