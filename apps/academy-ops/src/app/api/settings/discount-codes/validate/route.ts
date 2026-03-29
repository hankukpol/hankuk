import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { requireVisibleAcademyId } from "@/lib/academy-scope";
import { applyDiscountCodeAcademyScope, normalizeDiscountCode } from "@/lib/discount-codes/service";
import { getPrisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const academyId = requireVisibleAcademyId(auth.context);
    const body = await request.json();
    const { code, amount } = body as { code?: string; amount?: number };

    if (!code?.trim()) {
      return NextResponse.json({ valid: false, error: "코드를 입력해 주세요." }, { status: 400 });
    }
    if (amount === undefined || amount === null || Number.isNaN(Number(amount)) || Number(amount) < 0) {
      return NextResponse.json({ valid: false, error: "수강료 금액을 입력해 주세요." }, { status: 400 });
    }

    const discountCode = await getPrisma().discountCode.findFirst({
      where: applyDiscountCodeAcademyScope({ code: normalizeDiscountCode(code) }, academyId),
    });

    if (!discountCode) {
      return NextResponse.json({ valid: false, error: "존재하지 않는 할인 코드입니다." });
    }
    if (!discountCode.isActive) {
      return NextResponse.json({ valid: false, error: "비활성화된 할인 코드입니다." });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const validFrom = new Date(discountCode.validFrom);
    validFrom.setHours(0, 0, 0, 0);
    if (today < validFrom) {
      return NextResponse.json({ valid: false, error: "아직 유효 기간이 시작되지 않은 코드입니다." });
    }

    if (discountCode.validUntil) {
      const validUntil = new Date(discountCode.validUntil);
      validUntil.setHours(23, 59, 59, 999);
      if (today > validUntil) {
        return NextResponse.json({ valid: false, error: "만료된 할인 코드입니다." });
      }
    }

    if (discountCode.maxUsage !== null && discountCode.usageCount >= discountCode.maxUsage) {
      return NextResponse.json({ valid: false, error: "사용 한도가 초과된 할인 코드입니다." });
    }

    const fee = Number(amount);
    const rawDiscount =
      discountCode.discountType === "FIXED"
        ? discountCode.discountValue
        : Math.floor((fee * discountCode.discountValue) / 100);
    const finalDiscount = Math.min(rawDiscount, fee);

    return NextResponse.json({
      valid: true,
      codeId: discountCode.id,
      discountType: discountCode.discountType,
      discountValue: discountCode.discountValue,
      finalDiscount,
      description:
        discountCode.discountType === "FIXED"
          ? `${discountCode.discountValue.toLocaleString("ko-KR")}원 할인`
          : `${discountCode.discountValue}% 할인 (${finalDiscount.toLocaleString("ko-KR")}원)`,
    });
  } catch (error) {
    return NextResponse.json(
      { valid: false, error: error instanceof Error ? error.message : "할인 코드 검증에 실패했습니다." },
      { status: 400 },
    );
  }
}