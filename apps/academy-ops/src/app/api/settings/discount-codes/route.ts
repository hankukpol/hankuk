import { AdminRole, CodeType, DiscountType, Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { requireVisibleAcademyId } from "@/lib/academy-scope";
import { applyDiscountCodeAcademyScope, normalizeDiscountCode } from "@/lib/discount-codes/service";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const academyId = requireVisibleAcademyId(auth.context);
    const codes = await getPrisma().discountCode.findMany({
      where: applyDiscountCodeAcademyScope({}, academyId),
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: { staff: { select: { name: true } } },
    });

    return NextResponse.json({ data: codes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "할인 코드 목록을 불러오지 못했습니다." },
      { status: 400 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const academyId = requireVisibleAcademyId(auth.context);
    const body = await request.json();
    const { code, type, discountType, discountValue, maxUsage, validFrom, validUntil, isActive } = body;

    if (!code?.trim()) {
      return NextResponse.json({ error: "할인 코드를 입력해 주세요." }, { status: 400 });
    }
    if (!type || !Object.values(CodeType).includes(type)) {
      return NextResponse.json({ error: "코드 유형을 선택해 주세요." }, { status: 400 });
    }
    if (!discountType || !Object.values(DiscountType).includes(discountType)) {
      return NextResponse.json({ error: "할인 방식을 선택해 주세요." }, { status: 400 });
    }
    if (discountValue === undefined || Number.isNaN(Number(discountValue)) || Number(discountValue) <= 0) {
      return NextResponse.json({ error: "할인 값을 입력해 주세요." }, { status: 400 });
    }
    if (!validFrom) {
      return NextResponse.json({ error: "유효 시작일을 입력해 주세요." }, { status: 400 });
    }

    const newCode = await getPrisma().discountCode.create({
      data: {
        academyId,
        code: normalizeDiscountCode(code),
        type,
        discountType,
        discountValue: Number(discountValue),
        maxUsage: maxUsage ? Number(maxUsage) : null,
        validFrom: new Date(validFrom),
        validUntil: validUntil ? new Date(validUntil) : null,
        isActive: isActive !== false,
        staffId: auth.context.adminUser.id,
      },
      include: { staff: { select: { name: true } } },
    });

    return NextResponse.json({ code: newCode }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "현재 지점에 이미 같은 할인 코드가 있습니다." }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "할인 코드를 등록하지 못했습니다." },
      { status: 400 },
    );
  }
}