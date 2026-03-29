import { NextRequest } from "next/server";
import { AdminRole } from "@prisma/client";
import { getCurrentAdminContext, roleAtLeast } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string; subjectId: string }> };

// PATCH /api/settings/instructors/[id]/lecture-subjects/[subjectId]/rate
// Updates the instructorRate for a SpecialLectureSubject
export async function PATCH(req: NextRequest, { params }: Params) {
  const context = await getCurrentAdminContext();
  if (!context) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!roleAtLeast(context.adminUser.role, AdminRole.DIRECTOR)) {
    return Response.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const { id, subjectId } = await params;

  let body: { instructorRate?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const rate = Number(body.instructorRate);
  if (!Number.isInteger(rate) || rate < 0 || rate > 100) {
    return Response.json(
      { error: "배분율은 0~100 사이 정수여야 합니다." },
      { status: 400 },
    );
  }

  const prisma = getPrisma();

  // Verify the subject belongs to this instructor
  const subject = await prisma.specialLectureSubject.findFirst({
    where: { id: subjectId, instructorId: id },
  });

  if (!subject) {
    return Response.json({ error: "과목을 찾을 수 없습니다." }, { status: 404 });
  }

  const updated = await prisma.specialLectureSubject.update({
    where: { id: subjectId },
    data: { instructorRate: rate },
  });

  return Response.json({ data: { id: updated.id, instructorRate: updated.instructorRate } });
}
