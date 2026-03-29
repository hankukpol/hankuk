import { AbsenceCategory, AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  deleteAbsencePolicy,
  updateAbsencePolicy,
} from "@/lib/absence-policies/service";

type RequestBody = {
  name?: string;
  absenceCategory?: AbsenceCategory;
  attendCountsAsAttendance?: boolean;
  attendGrantsPerfectAttendance?: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

type RouteContext = {
  params: {
    id: string;
  };
};

function parseId(context: RouteContext) {
  return Number(context.params.id);
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const policyId = parseId(context);

    if (!Number.isInteger(policyId)) {
      return NextResponse.json({ error: "사유 정책 ID가 올바르지 않습니다." }, { status: 400 });
    }

    const body = (await request.json()) as RequestBody;
    const policy = await updateAbsencePolicy({
      adminId: auth.context.adminUser.id,
      policyId,
      payload: {
        name: String(body.name ?? ""),
        absenceCategory: body.absenceCategory ?? AbsenceCategory.OTHER,
        attendCountsAsAttendance: Boolean(body.attendCountsAsAttendance),
        attendGrantsPerfectAttendance: Boolean(body.attendGrantsPerfectAttendance),
        isActive: typeof body.isActive === "boolean" ? body.isActive : true,
        sortOrder: Number(body.sortOrder ?? 0),
      },
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(policy);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "사유 정책 수정에 실패했습니다." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const policyId = parseId(context);

    if (!Number.isInteger(policyId)) {
      return NextResponse.json({ error: "사유 정책 ID가 올바르지 않습니다." }, { status: 400 });
    }

    const result = await deleteAbsencePolicy({
      adminId: auth.context.adminUser.id,
      policyId,
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "사유 정책 삭제에 실패했습니다." },
      { status: 400 },
    );
  }
}