import { NextRequest, NextResponse } from "next/server";

import { toApiErrorResponse } from "@/lib/api-error-response";
import { requireApiAuth, requireStudentApiAuth } from "@/lib/api-auth";
import { getDivisionFeatureDisabledError } from "@/lib/division-feature-guard";
import { listStudentMorningExamWeeks } from "@/lib/services/morning-exam.service";

export async function GET(
  request: NextRequest,
  { params }: { params: { division: string; studentId: string } },
) {
  let studentId = params.studentId;

  const adminAuth = await requireApiAuth(
    params.division,
    ["ADMIN", "SUPER_ADMIN", "ASSISTANT"],
  ).catch(() => null);

  if (adminAuth?.ok) {
    studentId = params.studentId;
  } else {
    const studentAuth = await requireStudentApiAuth(params.division);

    if (!studentAuth.ok) {
      return NextResponse.json({ error: studentAuth.error }, { status: studentAuth.status });
    }

    if (studentAuth.session.studentId !== params.studentId) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }
    studentId = studentAuth.session.studentId;
  }

  const featureDisabledError = await getDivisionFeatureDisabledError(
    params.division,
    "examManagement",
  );

  if (featureDisabledError) {
    return NextResponse.json({ error: featureDisabledError }, { status: 403 });
  }

  const url = new URL(request.url);
  const examTypeId = url.searchParams.get("examTypeId") ?? undefined;

  try {
    const weeks = await listStudentMorningExamWeeks(
      params.division,
      studentId,
      examTypeId,
    );
    return NextResponse.json({ weeks });
  } catch (error) {
    return toApiErrorResponse(error, "아침모의고사 주차별 성적 조회 중 오류가 발생했습니다.");
  }
}
