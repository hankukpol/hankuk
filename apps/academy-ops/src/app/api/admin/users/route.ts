import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_LEVEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// GET /api/admin/users — list all admin users
export async function GET(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.DIRECTOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admins = await getPrisma().adminUser.findMany({
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ data: admins });
}

// POST /api/admin/users — invite new admin user
export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.DIRECTOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { email, name, role, phone } = body as {
      email?: string;
      name?: string;
      role?: AdminRole;
      phone?: string;
    };

    if (!email?.trim()) {
      return NextResponse.json({ error: "이메일을 입력하세요." }, { status: 400 });
    }
    if (!name?.trim()) {
      return NextResponse.json({ error: "이름을 입력하세요." }, { status: 400 });
    }
    if (!role || !(role in AdminRole)) {
      return NextResponse.json({ error: "유효한 권한을 선택해 주세요." }, { status: 400 });
    }

    // Cannot grant higher or equal role than own
    const myLevel = ROLE_LEVEL[auth.context.adminUser.role];
    const targetLevel = ROLE_LEVEL[role];
    if (targetLevel >= myLevel) {
      return NextResponse.json(
        { error: "본인보다 높거나 같은 권한을 부여할 수 없습니다." },
        { status: 403 },
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    // Check for duplicate email
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

    // Create AdminUser record with the Supabase Auth UUID
    const newAdminUser = await getPrisma().adminUser.create({
      data: {
        id: inviteData.user.id,
        email: cleanEmail,
        name: cleanName,
        role,
        phone: phone?.trim() || null,
        isActive: false, // becomes active upon first login / manual activation
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ data: newAdminUser });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "초대 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
