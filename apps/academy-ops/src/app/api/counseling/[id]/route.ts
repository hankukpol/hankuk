/**
 * PUT  /api/counseling/[id]  - 면담 기록 수정
 * DELETE /api/counseling/[id] - 면담 기록 삭제
 *
 * PUT action 분기:
 * - action 없음 (기본): 면담 내용·일자·강사 수정
 * - action === "changeStudent": 면담 기록의 수험번호 변경
 *   → 잘못된 학생으로 등록된 기록을 올바른 학생으로 이전
 */
import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  changeCounselingStudent,
  deleteCounselingRecord,
  updateCounselingRecord,
} from "@/lib/counseling/service";

type RequestBody = {
  action?: "changeStudent";
  newExamNumber?: string;    // action === "changeStudent" 일 때 필수
  counselorName?: string;
  content?: string;
  recommendation?: string | null;
  counseledAt?: string;
  nextSchedule?: string | null;
};

type RouteContext = {
  params: {
    id: string;
  };
};

export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const recordId = Number(params.id);

    if (!Number.isInteger(recordId)) {
      return NextResponse.json({ error: "면담 기록 ID가 올바르지 않습니다." }, { status: 400 });
    }

    const body = (await request.json()) as RequestBody;

    // 학생 변경 액션: 수험번호만 교체, 기타 필드는 건드리지 않음
    if (body.action === "changeStudent") {
      const record = await changeCounselingStudent({
        adminId: auth.context.adminUser.id,
        recordId,
        newExamNumber: String(body.newExamNumber ?? ""),
        ipAddress: request.headers.get("x-forwarded-for"),
      });
      return NextResponse.json({ record });
    }

    // 기본 액션: 면담 내용·일자·강사명 수정
    const record = await updateCounselingRecord({
      adminId: auth.context.adminUser.id,
      recordId,
      payload: {
        counselorName: String(body.counselorName ?? ""),
        content: String(body.content ?? ""),
        recommendation: body.recommendation ?? null,
        counseledAt: new Date(String(body.counseledAt ?? "")),
        nextSchedule: body.nextSchedule ? new Date(body.nextSchedule) : null,
      },
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "면담 기록 수정에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}

// PATCH is an alias for PUT — same business logic, both verbs accepted
export async function PATCH(request: Request, context: RouteContext) {
  return PUT(request, context);
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const recordId = Number(params.id);

    if (!Number.isInteger(recordId)) {
      return NextResponse.json({ error: "면담 기록 ID가 올바르지 않습니다." }, { status: 400 });
    }

    await deleteCounselingRecord({
      adminId: auth.context.adminUser.id,
      recordId,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "면담 기록 삭제에 실패했습니다." },
      { status: 400 },
    );
  }
}
