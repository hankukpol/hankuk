import { NextRequest, NextResponse } from "next/server";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";
import {
  getStudentPortalAttendanceSummary,
  getStudentPortalAttendanceCalendarData,
} from "@/student-portal-api-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ?? undefined;

  // month 파라미터가 있으면 월별 캘린더 데이터 반환
  if (month) {
    const data = await getStudentPortalAttendanceCalendarData({
      examNumber: auth.student.examNumber,
      month,
    });

    if (!data) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    return NextResponse.json({ data });
  }

  // 기본: 출결 요약 반환
  const data = await getStudentPortalAttendanceSummary({
    examNumber: auth.student.examNumber,
  });

  if (!data) {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }

  return NextResponse.json({ data });
}
