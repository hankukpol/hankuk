import { AdminRole, StaffRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { ROLE_LEVEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

// GET /api/settings/staff/[id]
export async function GET(
  _request: NextRequest,
  context: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = context.params;

  const adminUser = await getPrisma().adminUser.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      staff: {
        select: {
          id: true,
          role: true,
          mobile: true,
          note: true,
          lastLoginAt: true,
          isActive: true,
        },
      },
    },
  });

  if (!adminUser) {
    return NextResponse.json({ error: "직원을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ data: adminUser });
}

// PATCH /api/settings/staff/[id]
export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } },
) {
  const auth = await requireApiAdmin(AdminRole.DIRECTOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = context.params;

  try {
    const body = await request.json();
    const { name, phone, role, isActive, staffRole, shareRatio } = body as {
      name?: string;
      phone?: string | null;
      role?: AdminRole;
      isActive?: boolean;
      staffRole?: StaffRole | null;
      shareRatio?: number | null;
    };

    const existing = await getPrisma().adminUser.findUnique({
      where: { id },
      include: { staff: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "직원을 찾을 수 없습니다." }, { status: 404 });
    }

    // Cannot modify own account role/active
    if (id === auth.context.adminUser.id && (role !== undefined || isActive === false)) {
      return NextResponse.json(
        { error: "본인 계정의 권한/활성화 상태는 변경할 수 없습니다." },
        { status: 400 },
      );
    }

    // Cannot grant higher or equal role than own
    if (role !== undefined) {
      const myLevel = ROLE_LEVEL[auth.context.adminUser.role];
      const targetLevel = ROLE_LEVEL[role as AdminRole];
      if (targetLevel >= myLevel) {
        return NextResponse.json(
          { error: "본인보다 높거나 같은 권한을 부여할 수 없습니다." },
          { status: 403 },
        );
      }
    }

    const adminData: Record<string, unknown> = {};
    if (name !== undefined) adminData.name = name.trim();
    if (phone !== undefined) adminData.phone = phone?.trim() || null;
    if (role !== undefined) adminData.role = role;
    if (isActive !== undefined) adminData.isActive = isActive;

    const prisma = getPrisma();

    // Update AdminUser
    const updated = await prisma.adminUser.update({
      where: { id },
      data: adminData,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        isActive: true,
        updatedAt: true,
        staff: {
          select: {
            id: true,
            role: true,
            mobile: true,
            lastLoginAt: true,
            isActive: true,
          },
        },
      },
    });

    // Update Staff fields if Staff record exists
    if (existing.staff) {
      const staffData: Record<string, unknown> = {};
      if (staffRole !== undefined) {
        staffData.role = staffRole ?? existing.staff.role;
      }
      if (shareRatio !== undefined) {
        // Store shareRatio in note as JSON since schema doesn't have a dedicated field
        let noteData: Record<string, unknown> = {};
        try {
          noteData = existing.staff.note
            ? (JSON.parse(existing.staff.note) as Record<string, unknown>)
            : {};
        } catch {
          noteData = {};
        }
        noteData.shareRatio = shareRatio;
        staffData.note = JSON.stringify(noteData);
      }
      if (Object.keys(staffData).length > 0) {
        await prisma.staff.update({
          where: { id: existing.staff.id },
          data: staffData,
        });
      }
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}
