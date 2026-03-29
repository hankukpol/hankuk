import { NextResponse } from "next/server";
import { DEFAULT_CONTACT_FALLBACK } from "@/lib/academy-branding";
import { requireStudentPortalStudent } from "@/lib/student-portal/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireStudentPortalStudent(request);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return NextResponse.json(
    {
      error:
        `학생 포털은 학번과 이름으로만 로그인합니다. 연락처 변경이 필요하시면 ${DEFAULT_CONTACT_FALLBACK}`,
    },
    { status: 400 },
  );
}
