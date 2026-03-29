import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { applyAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ enrollmentId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { enrollmentId } = await context.params;
  const academyId = resolveVisibleAcademyId(auth.context);

  const enrollment = await getPrisma().courseEnrollment.findFirst({
    where: applyAcademyScope({ id: enrollmentId }, academyId),
    select: {
      id: true,
      examNumber: true,
      contract: {
        select: {
          id: true,
          privacyConsentedAt: true,
        },
      },
    },
  });

  if (!enrollment?.contract) {
    return NextResponse.json({ error: "계약서를 찾을 수 없습니다." }, { status: 404 });
  }

  if (!enrollment.contract.privacyConsentedAt) {
    return NextResponse.json(
      { error: "필수 개인정보 수집·이용 동의 기록이 없어 계약서를 출력할 수 없습니다." },
      { status: 400 },
    );
  }

  const updated = await getPrisma().courseContract.update({
    where: { enrollmentId },
    data: { printedAt: new Date() },
  });

  await getPrisma().auditLog.create({
    data: {
      adminId: auth.context.adminUser.id,
      action: "CONTRACT_PRINT",
      targetType: "CourseContract",
      targetId: updated.id,
      after: {
        enrollmentId,
        examNumber: enrollment.examNumber,
        printedAt: updated.printedAt?.toISOString() ?? null,
        privacyConsentedAt: enrollment.contract.privacyConsentedAt?.toISOString() ?? null,
      },
      ipAddress: request.headers.get("x-forwarded-for"),
    },
  });

  return NextResponse.json({ data: { printedAt: updated.printedAt } });
}
