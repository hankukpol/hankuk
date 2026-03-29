import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { requireVisibleAcademyId } from "@/lib/academy-scope";
import {
  deactivateStudent,
  parseStudentForm,
  reactivateStudent,
  updateStudent,
} from "@/lib/students/service";
import { getPrisma } from "@/lib/prisma";

type RouteContext = {
  params: {
    examNumber: string;
  };
};

export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    requireVisibleAcademyId(auth.context);
    const body = (await request.json()) as Record<string, unknown>;
    const student = parseStudentForm(body);
    const updated = await updateStudent({
      adminId: auth.context.adminUser.id,
      examNumber: params.examNumber,
      student,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ student: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "학생 수정에 실패했습니다." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const academyId = requireVisibleAcademyId(auth.context);
    let body: Record<string, unknown> = {};
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      // 빈 본문은 재활성화 요청으로 처리
    }

    if ("notificationConsent" in body) {
      const consent = body.notificationConsent;
      if (typeof consent !== "boolean") {
        return NextResponse.json({ error: "notificationConsent는 boolean이어야 합니다." }, { status: 400 });
      }

      const student = await getPrisma().student.update({
        where: { examNumber: params.examNumber, academyId },
        data: {
          notificationConsent: consent,
          consentedAt: consent ? new Date() : undefined,
        },
      });
      return NextResponse.json({ student });
    }

    if ("parentName" in body || "parentRelation" in body || "parentMobile" in body) {
      const parentName =
        body.parentName !== undefined
          ? typeof body.parentName === "string"
            ? body.parentName.trim() || null
            : null
          : undefined;
      const parentRelation =
        body.parentRelation !== undefined
          ? typeof body.parentRelation === "string"
            ? body.parentRelation.trim() || null
            : null
          : undefined;
      const parentMobile =
        body.parentMobile !== undefined
          ? typeof body.parentMobile === "string"
            ? body.parentMobile.trim() || null
            : null
          : undefined;

      const student = await getPrisma().student.update({
        where: { examNumber: params.examNumber, academyId },
        data: {
          ...(parentName !== undefined && { parentName }),
          ...(parentRelation !== undefined && { parentRelation }),
          ...(parentMobile !== undefined && { parentMobile }),
        },
      });
      return NextResponse.json({ student });
    }

    const student = await reactivateStudent({
      adminId: auth.context.adminUser.id,
      examNumber: params.examNumber,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ student });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "처리에 실패했습니다." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    requireVisibleAcademyId(auth.context);
    await deactivateStudent({
      adminId: auth.context.adminUser.id,
      examNumber: params.examNumber,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "비활성화에 실패했습니다." },
      { status: 400 },
    );
  }
}