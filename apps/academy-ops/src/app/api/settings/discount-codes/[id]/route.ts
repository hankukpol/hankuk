import { AdminRole, CodeType, DiscountType, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { requireVisibleAcademyId } from "@/lib/academy-scope";
import { applyDiscountCodeAcademyScope, normalizeDiscountCode } from "@/lib/discount-codes/service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const academyId = requireVisibleAcademyId(auth.context);
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "잘못된 할인 코드 ID입니다." }, { status: 400 });
    }

    const code = await getPrisma().discountCode.findFirst({
      where: applyDiscountCodeAcademyScope({ id }, academyId),
      include: {
        staff: { select: { name: true } },
        usages: {
          orderBy: { usedAt: "desc" },
          include: {
            student: { select: { examNumber: true, name: true, phone: true } },
            payment: {
              select: {
                id: true,
                discountAmount: true,
                netAmount: true,
                createdAt: true,
                enrollmentId: true,
              },
            },
          },
        },
      },
    });

    if (!code) {
      return NextResponse.json({ error: "할인 코드를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ data: code });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "할인 코드를 불러오지 못했습니다." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const academyId = requireVisibleAcademyId(auth.context);
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "잘못된 할인 코드 ID입니다." }, { status: 400 });
    }

    const existing = await getPrisma().discountCode.findFirst({
      where: applyDiscountCodeAcademyScope({ id }, academyId),
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "할인 코드를 찾을 수 없습니다." }, { status: 404 });
    }

    const body = await request.json();
    const { code, type, discountType, discountValue, maxUsage, validFrom, validUntil, isActive } = body;

    if (type && !Object.values(CodeType).includes(type)) {
      return NextResponse.json({ error: "유효하지 않은 코드 유형입니다." }, { status: 400 });
    }
    if (discountType && !Object.values(DiscountType).includes(discountType)) {
      return NextResponse.json({ error: "유효하지 않은 할인 방식입니다." }, { status: 400 });
    }

    const updated = await getPrisma().discountCode.update({
      where: { id },
      data: {
        ...(code !== undefined ? { code: normalizeDiscountCode(code) } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(discountType !== undefined ? { discountType } : {}),
        ...(discountValue !== undefined ? { discountValue: Number(discountValue) } : {}),
        ...(maxUsage !== undefined ? { maxUsage: maxUsage ? Number(maxUsage) : null } : {}),
        ...(validFrom !== undefined ? { validFrom: new Date(validFrom) } : {}),
        ...(validUntil !== undefined ? { validUntil: validUntil ? new Date(validUntil) : null } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      include: { staff: { select: { name: true } } },
    });

    return NextResponse.json({ code: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "현재 지점에 이미 같은 할인 코드가 있습니다." }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "할인 코드를 수정하지 못했습니다." },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const academyId = requireVisibleAcademyId(auth.context);
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "잘못된 할인 코드 ID입니다." }, { status: 400 });
    }

    const existing = await getPrisma().discountCode.findFirst({
      where: applyDiscountCodeAcademyScope({ id }, academyId),
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "할인 코드를 찾을 수 없습니다." }, { status: 404 });
    }

    const usage = await getPrisma().discountCodeUsage.findFirst({ where: { codeId: id } });
    if (usage) {
      return NextResponse.json(
        { error: "이미 사용된 할인 코드는 삭제할 수 없습니다. 비활성화로 전환해 주세요." },
        { status: 400 },
      );
    }

    await getPrisma().discountCode.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "할인 코드를 삭제하지 못했습니다." },
      { status: 400 },
    );
  }
}