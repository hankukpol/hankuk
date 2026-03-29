import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  getMissingScoreSessionSummary,
  parseMissingScoreSessionId,
} from "@/lib/notifications/missing-scores";

export async function GET(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = parseMissingScoreSessionId(
    request.nextUrl.searchParams.get("sessionId"),
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const summary = await getMissingScoreSessionSummary(parsed.sessionId);

  if (!summary) {
    return NextResponse.json({ error: "회차를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({
    students: summary.students,
    sessionId: summary.session.id,
    periodId: summary.session.periodId,
    expectedCount: summary.expectedCount,
    scoreCount: summary.scoreCount,
    missingCount: summary.missingCount,
    examType: summary.session.examType,
  });
}
