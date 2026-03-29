import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { requireVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";

type RouteContext = {
  params: {
    examNumber: string;
  };
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const academyId = requireVisibleAcademyId(auth.context);
  const prisma = getPrisma();

  const student = await prisma.student.findFirst({
    where: { examNumber: params.examNumber, academyId },
    select: { isActive: true, name: true },
  });

  if (!student) {
    return NextResponse.json({ error: "학생을 찾을 수 없습니다." }, { status: 404 });
  }

  const updated = await prisma.student.update({
    where: { examNumber: params.examNumber, academyId },
    data: { isActive: !student.isActive },
    select: { isActive: true },
  });

  await prisma.auditLog.create({
    data: {
      adminId: auth.context.adminUser.id,
      action: "STUDENT_TOGGLE_ACTIVE",
      targetType: "Student",
      targetId: params.examNumber,
      after: {
        isActive: updated.isActive,
        action: updated.isActive ? "활성화" : "비활성화",
      },
      ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    },
  });

  return NextResponse.json({ data: { isActive: updated.isActive } });
}