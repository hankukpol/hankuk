import { NextRequest, NextResponse } from "next/server";
import { listStudentNotices } from "@/lib/notices/service";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";

export async function GET(request: NextRequest) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const notices = await listStudentNotices(auth.student.examType);

  return NextResponse.json({ notices });
}