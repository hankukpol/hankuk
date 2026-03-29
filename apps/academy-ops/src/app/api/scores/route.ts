import { AdminRole, ExamType, Subject } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { listScores } from "@/lib/scores/service";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.VIEWER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const searchParams = request.nextUrl.searchParams;
  const sessionIdValue = searchParams.get("sessionId");
  const periodIdValue = searchParams.get("periodId");
  const weekValue = searchParams.get("week");
  const dateValue = searchParams.get("date");

  const scores = await listScores({
    sessionId: sessionIdValue ? Number(sessionIdValue) : undefined,
    periodId: periodIdValue ? Number(periodIdValue) : undefined,
    examType: (searchParams.get("examType") as ExamType | null) ?? undefined,
    week: weekValue ? Number(weekValue) : undefined,
    subject: (searchParams.get("subject") as Subject | null) ?? undefined,
    examNumber: searchParams.get("examNumber") ?? undefined,
    query: searchParams.get("query") ?? undefined,
    date: dateValue ? new Date(dateValue) : undefined,
  });

  return NextResponse.json({ scores });
}
