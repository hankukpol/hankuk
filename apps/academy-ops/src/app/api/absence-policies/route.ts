import { AbsenceCategory, AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  createAbsencePolicy,
  listAbsencePolicies,
} from "@/lib/absence-policies/service";

type RequestBody = {
  name?: string;
  absenceCategory?: AbsenceCategory;
  attendCountsAsAttendance?: boolean;
  attendGrantsPerfectAttendance?: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

export async function GET() {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const policies = await listAbsencePolicies();
  return NextResponse.json({ policies });
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.TEACHER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const policy = await createAbsencePolicy({
      adminId: auth.context.adminUser.id,
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
      { error: error instanceof Error ? error.message : "사유 정책 저장에 실패했습니다." },
      { status: 400 },
    );
  }
}