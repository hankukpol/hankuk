import { NextRequest, NextResponse } from "next/server";

import { buildDelimitedLine, buildExcelFriendlyCsv } from "@/lib/csv";
import { createCp949CsvResponse } from "@/lib/csv-response";
import { requireApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { getMorningExamWeeklySummary } from "@/lib/services/morning-exam.service";

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
  const weekYear = Number(request.nextUrl.searchParams.get("weekYear") ?? "");
  const weekNumber = Number(request.nextUrl.searchParams.get("weekNumber") ?? "");

  if (!examTypeId || !Number.isInteger(weekYear) || !Number.isInteger(weekNumber)) {
    return NextResponse.json(
      { error: "examTypeId, weekYear, weekNumber 파라미터를 확인해주세요." },
      { status: 400 },
    );
  }

  const summary = await getMorningExamWeeklySummary(
    params.division,
    examTypeId,
    weekYear,
    weekNumber,
  );

  const header = buildDelimitedLine([
    "수험번호",
    "이름",
    ...summary.dailyEntries.map((entry) => `${entry.dayOfWeek}(${entry.subjectName})`),
    "주간합",
    "평균",
    "석차",
  ]);

  const rows = summary.rankings.map((ranking) =>
    buildDelimitedLine([
      ranking.studentNumber,
      ranking.studentName,
      ...summary.dailyEntries.map((entry) => ranking.dailyScores[entry.date]?.score ?? ""),
      ranking.weeklyTotal ?? "",
      ranking.weeklyAverage ?? "",
      ranking.weeklyRank ?? "",
    ]),
  );

  const content = buildExcelFriendlyCsv([header, ...rows]);
  return createCp949CsvResponse(
    content,
    `morning-exam-weekly_${summary.weekYear}W${summary.weekNumber}.csv`,
  );
}
