import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (isNaN(id)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

    const body = await request.json();
    const { name, description, defaultAmount, isActive } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (defaultAmount !== undefined) updateData.defaultAmount = Number(defaultAmount);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const policy = await getPrisma().pointPolicy.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ policy });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (isNaN(id)) return NextResponse.json({ error: "잘못된 ID" }, { status: 400 });

    await getPrisma().pointPolicy.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제 실패" },
      { status: 400 },
    );
  }
}
