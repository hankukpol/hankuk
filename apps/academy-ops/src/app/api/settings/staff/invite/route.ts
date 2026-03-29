import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// POST /api/settings/staff/invite
// Body: { email: string, displayName: string, role: AdminRole }
export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.SUPER_ADMIN);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { email, displayName, role } = body as {
      email?: string;
      displayName?: string;
      role?: AdminRole;
    };

    if (!email?.trim() || !displayName?.trim()) {
      return NextResponse.json(
        { error: "이메일과 이름은 필수입니다." },
        { status: 400 },
      );
    }

    if (!role || !(role in AdminRole)) {
      return NextResponse.json(
        { error: "유효한 권한을 선택해 주세요." },
        { status: 400 },
      );
    }

    // Cannot invite with higher or equal role than own
    const ROLE_LEVEL: Record<AdminRole, number> = {
      VIEWER: 0,
      TEACHER: 1,
      COUNSELOR: 2,
      ACADEMIC_ADMIN: 3,
      MANAGER: 4,
      DEPUTY_DIRECTOR: 5,
      DIRECTOR: 6,
      SUPER_ADMIN: 7,
    };
    const myLevel = ROLE_LEVEL[auth.context.adminUser.role];
    const targetLevel = ROLE_LEVEL[role];
    if (targetLevel >= myLevel) {
      return NextResponse.json(
        { error: "본인보다 높거나 같은 권한을 부여할 수 없습니다." },
        { status: 403 },
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim();

    // Check existing AdminUser
    const existing = await getPrisma().adminUser.findUnique({
      where: { email: cleanEmail },
    });
    if (existing) {
      return NextResponse.json(
        { error: "이미 등록된 이메일 주소입니다." },
        { status: 409 },
      );
    }

    // Invite via Supabase Admin API
    const supabaseAdmin = createAdminClient();
    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(cleanEmail, {
        data: {
          display_name: cleanName,
          admin_role: role,
        },
      });

    if (inviteError || !inviteData?.user) {
      return NextResponse.json(
        { error: inviteError?.message ?? "초대 이메일 발송에 실패했습니다." },
        { status: 500 },
      );
    }

    // Create AdminUser record with Supabase Auth UUID
    const adminUser = await getPrisma().adminUser.create({
      data: {
        id: inviteData.user.id, // Supabase Auth UUID
        email: cleanEmail,
        name: cleanName,
        role,
        isActive: false, // becomes active upon first login / manual activation
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ data: adminUser });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "초대 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
