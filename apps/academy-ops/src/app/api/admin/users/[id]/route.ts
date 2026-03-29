import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_LEVEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// PATCH /api/admin/users/[id] — edit role, name, phone, isActive
export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.DIRECTOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = context.params;

  try {
    const body = await request.json();
    const { role, name, phone, isActive } = body as {
      role?: AdminRole;
      name?: string;
      phone?: string | null;
      isActive?: boolean;
    };

    const existing = await getPrisma().adminUser.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "관리자를 찾을 수 없습니다." }, { status: 404 });
    }

    // Cannot edit own account's role to a lower level
    if (id === auth.context.adminUser.id) {
      if (role !== undefined && ROLE_LEVEL[role] < ROLE_LEVEL[auth.context.adminUser.role]) {
        return NextResponse.json(
          { error: "본인 계정의 권한을 낮출 수 없습니다." },
          { status: 400 },
        );
      }
      if (isActive === false) {
        return NextResponse.json(
          { error: "본인 계정을 비활성화할 수 없습니다." },
          { status: 400 },
        );
      }
    }

    // Cannot grant higher or equal role than own
    if (role !== undefined) {
      const myLevel = ROLE_LEVEL[auth.context.adminUser.role];
      const targetLevel = ROLE_LEVEL[role];
      if (targetLevel >= myLevel) {
        return NextResponse.json(
          { error: "본인보다 높거나 같은 권한을 부여할 수 없습니다." },
          { status: 403 },
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (role !== undefined) updateData.role = role;
    if (isActive !== undefined) updateData.isActive = isActive;

    const updatedUser = await getPrisma().adminUser.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json({ data: updatedUser });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}

// DELETE /api/admin/users/[id] — soft delete (isActive=false) + remove from Supabase Auth
export async function DELETE(
  _request: NextRequest,
  context: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.DIRECTOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = context.params;

  // Cannot delete own account
  if (id === auth.context.adminUser.id) {
    return NextResponse.json(
      { error: "본인 계정은 비활성화할 수 없습니다." },
      { status: 400 },
    );
  }

  try {
    const existing = await getPrisma().adminUser.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "관리자를 찾을 수 없습니다." }, { status: 404 });
    }

    // Cannot deactivate a user with higher or equal role
    const myLevel = ROLE_LEVEL[auth.context.adminUser.role];
    const targetLevel = ROLE_LEVEL[existing.role];
    if (targetLevel >= myLevel) {
      return NextResponse.json(
        { error: "본인보다 높거나 같은 권한의 계정을 비활성화할 수 없습니다." },
        { status: 403 },
      );
    }

    // Soft delete in DB
    const updatedUser = await getPrisma().adminUser.update({
      where: { id },
      data: { isActive: false },
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

    // Remove from Supabase Auth (hard delete on auth side)
    const supabaseAdmin = createAdminClient();
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (deleteError) {
      // Log but don't fail — DB record is already deactivated
      console.error("[DELETE admin user] Supabase Auth delete failed:", deleteError.message);
    }

    return NextResponse.json({ data: updatedUser });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "비활성화 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
