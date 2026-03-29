import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const MAX_DISCOUNT = 500000;

type DiscountItem = {
  /** 할인 유형 레이블 (표시용) */
  label: string;
  /** RATE: 비율 (0~1), FIXED: 정액(원) 중 하나를 지정 */
  rate?: number;
  amount?: number;
};

type AppliedDiscount = DiscountItem & {
  calculatedAmount: number;
};

function calculateDiscount(regularFee: number, discounts: DiscountItem[]) {
  const items = discounts.slice(0, 2); // 최대 2개
  let rawTotal = 0;
  const applied: AppliedDiscount[] = items.map((d) => {
    const calculatedAmount =
      d.rate != null
        ? Math.floor(regularFee * d.rate)
        : Math.max(0, d.amount ?? 0);
    rawTotal += calculatedAmount;
    return { ...d, calculatedAmount };
  });

  const capped = rawTotal > MAX_DISCOUNT;
  const totalDiscount = Math.min(rawTotal, MAX_DISCOUNT);
  const capAdjustment = capped ? rawTotal - MAX_DISCOUNT : 0;

  return {
    regularFee,
    appliedDiscounts: applied,
    rawTotalDiscount: rawTotal,
    capAdjustment,
    totalDiscount,
    finalFee: Math.max(0, regularFee - totalDiscount),
    cappedByLimit: capped,
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { regularFee, discounts } = body as {
      regularFee?: number;
      discounts?: DiscountItem[];
    };

    if (regularFee === undefined || regularFee === null || isNaN(Number(regularFee)) || Number(regularFee) < 0) {
      return NextResponse.json({ error: "정가(regularFee)를 올바르게 입력해주세요." }, { status: 400 });
    }

    if (!Array.isArray(discounts)) {
      return NextResponse.json({ error: "discounts 배열이 필요합니다." }, { status: 400 });
    }

    if (discounts.length > 2) {
      return NextResponse.json({ error: "할인은 최대 2개까지 적용 가능합니다." }, { status: 400 });
    }

    // 각 할인 항목 유효성 검사
    for (const d of discounts) {
      if (d.rate == null && d.amount == null) {
        return NextResponse.json(
          { error: `할인 항목에 rate 또는 amount 중 하나가 필요합니다.` },
          { status: 400 },
        );
      }
      if (d.rate != null && (d.rate < 0 || d.rate > 1)) {
        return NextResponse.json(
          { error: `rate는 0~1 사이의 값이어야 합니다 (예: 30% → 0.3).` },
          { status: 400 },
        );
      }
      if (d.amount != null && d.amount < 0) {
        return NextResponse.json({ error: "amount는 0 이상이어야 합니다." }, { status: 400 });
      }
    }

    const result = calculateDiscount(Number(regularFee), discounts);

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "계산 실패" },
      { status: 500 },
    );
  }
}
