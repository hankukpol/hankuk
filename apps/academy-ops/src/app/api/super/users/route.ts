import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import {
  inviteSuperAdminUser,
  listSuperAdminUsers,
  parseSuperAdminUserInput,
} from "@/lib/super-admin";

export async function GET() {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const users = await listSuperAdminUsers();
  return NextResponse.json({ data: users });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const input = parseSuperAdminUserInput(body);
    const user = await inviteSuperAdminUser(input, {
      adminId: auth.context.adminUser.id,
      ipAddress: request.headers.get("x-forwarded-for"),
    });
    return NextResponse.json({ data: user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "관리자 초대 중 오류가 발생했습니다." },
      { status: 400 },
    );
  }
}
