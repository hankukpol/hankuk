import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

type RouteContext = { params: { id: string } };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = context.params;
    if (!id) throw new Error("잘못된 상품 ID");
    const body = await request.json();
    const { name, examCategory, durationMonths, regularPrice, salePrice, features, isActive } =
      body;

    const product = await getPrisma().$transaction(async (tx) => {
      const existing = await tx.comprehensiveCourseProduct.findUniqueOrThrow({ where: { id } });
      const updated = await tx.comprehensiveCourseProduct.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name: name.trim() } : {}),
          ...(examCategory !== undefined ? { examCategory } : {}),
          ...(durationMonths !== undefined
            ? { durationMonths: Number(durationMonths) }
            : {}),
          ...(regularPrice !== undefined ? { regularPrice: Number(regularPrice) } : {}),
          ...(salePrice !== undefined ? { salePrice: Number(salePrice) } : {}),
          ...(features !== undefined ? { features: features?.trim() || null } : {}),
          ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "UPDATE_COMPREHENSIVE_PRODUCT",
          targetType: "comprehensiveCourseProduct",
          targetId: id,
          before: { name: existing.name, salePrice: existing.salePrice },
          after: { name: updated.name, salePrice: updated.salePrice },
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });
      return updated;
    });

    return NextResponse.json({ product });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "수정 실패" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = context.params;
    if (!id) throw new Error("잘못된 상품 ID");

    await getPrisma().$transaction(async (tx) => {
      const existing = await tx.comprehensiveCourseProduct.findUniqueOrThrow({ where: { id } });
      await tx.comprehensiveCourseProduct.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          adminId: auth.context.adminUser.id,
          action: "DELETE_COMPREHENSIVE_PRODUCT",
          targetType: "comprehensiveCourseProduct",
          targetId: id,
          before: { name: existing.name },
          after: undefined,
          ipAddress: request.headers.get("x-forwarded-for"),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "삭제 실패" },
      { status: 400 },
    );
  }
}
