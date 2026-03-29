import { AdminRole } from "@prisma/client";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  bulkRemoveEnrollments,
  executeEnrollmentPaste,
  listPeriodEnrollments,
  previewEnrollmentPaste,
  removeEnrollment,
} from "@/lib/periods/enrollments";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const periodId = Number(params.id);
  if (Number.isNaN(periodId)) {
    return NextResponse.json({ error: "잘못된 기간 ID입니다." }, { status: 400 });
  }

  const enrollments = await listPeriodEnrollments(periodId);
  return NextResponse.json({ enrollments });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const periodId = Number(params.id);
  if (Number.isNaN(periodId)) {
    return NextResponse.json({ error: "잘못된 기간 ID입니다." }, { status: 400 });
  }

  const body = await request.json();
  const { action, text, examNumbers } = body as {
    action: "preview" | "execute";
    text?: string;
    examNumbers?: string[];
  };

  if (action === "preview") {
    if (!text) {
      return NextResponse.json({ error: "붙여넣기 텍스트를 입력해 주세요." }, { status: 400 });
    }
    const result = await previewEnrollmentPaste(periodId, text);
    return NextResponse.json(result);
  }

  if (action === "execute") {
    if (!examNumbers?.length) {
      return NextResponse.json({ error: "등록할 수험번호를 선택해 주세요." }, { status: 400 });
    }
    const result = await executeEnrollmentPaste({
      adminId: auth.context.adminUser.id,
      periodId,
      examNumbers,
      ipAddress: request.headers.get("x-forwarded-for"),
    });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "지원하지 않는 action입니다." }, { status: 400 });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const periodId = Number(params.id);
  if (Number.isNaN(periodId)) {
    return NextResponse.json({ error: "잘못된 기간 ID입니다." }, { status: 400 });
  }

  try {
    const body = (await request.json()) as {
      examNumber?: string;
      examNumbers?: string[];
      removeAll?: boolean;
    };

    const examNumber = String(body.examNumber ?? "").trim();
    const examNumbers =
      body.examNumbers?.map((value) => String(value).trim()).filter(Boolean) ?? [];

    if (body.removeAll || examNumbers.length > 1) {
      const result = await bulkRemoveEnrollments({
        adminId: auth.context.adminUser.id,
        periodId,
        examNumbers,
        removeAll: Boolean(body.removeAll),
        ipAddress: request.headers.get("x-forwarded-for"),
      });

      return NextResponse.json(result);
    }

    const targetExamNumber = examNumber || examNumbers[0];

    if (!targetExamNumber) {
      return NextResponse.json({ error: "수험번호를 입력해 주세요." }, { status: 400 });
    }

    await removeEnrollment({
      adminId: auth.context.adminUser.id,
      periodId,
      examNumber: targetExamNumber,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ ok: true, removedCount: 1, examNumbers: [targetExamNumber] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수강생 해제에 실패했습니다." },
      { status: 400 },
    );
  }
}
