import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import { getSystemConfig, DEFAULT_SYSTEM_CONFIG } from "@/lib/system-config";

export const dynamic = "force-dynamic";

// GET /api/settings/refund-policies — returns current refund rates + last updated
export async function GET(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const config = await getSystemConfig();
    const row = await getPrisma().systemConfig.findUnique({
      where: { id: "singleton" },
      select: { updatedAt: true },
    });

    return NextResponse.json({
      data: {
        refundBeforeStart: config.refundBeforeStart,
        refundBefore1Third: config.refundBefore1Third,
        refundBefore1Half: config.refundBefore1Half,
        refundAfter1Half: config.refundAfter1Half,
        updatedAt: row?.updatedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "조회 실패" },
      { status: 500 },
    );
  }
}

// PATCH /api/settings/refund-policies — requires MANAGER (not SUPER_ADMIN)
export async function PATCH(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const {
      refundBeforeStart,
      refundBefore1Third,
      refundBefore1Half,
      refundAfter1Half,
    } = body as {
      refundBeforeStart?: number;
      refundBefore1Third?: number;
      refundBefore1Half?: number;
      refundAfter1Half?: number;
    };

    // Validate: all four must be provided and be numbers 0-100
    const values = {
      refundBeforeStart,
      refundBefore1Third,
      refundBefore1Half,
      refundAfter1Half,
    };
    for (const [key, val] of Object.entries(values)) {
      if (val === undefined || typeof val !== "number" || val < 0 || val > 100) {
        return NextResponse.json(
          { error: `${key} 값이 올바르지 않습니다. (0~100 숫자)` },
          { status: 400 },
        );
      }
    }

    // Legal minimums validation (server-side guard)
    if ((refundBeforeStart as number) < 100) {
      return NextResponse.json({ error: "수업 시작 전 환불 비율은 100% 이상이어야 합니다." }, { status: 400 });
    }
    if ((refundBefore1Third as number) < 67) {
      return NextResponse.json({ error: "1/3 미만 수강 시 환불 비율은 67% 이상이어야 합니다." }, { status: 400 });
    }
    if ((refundBefore1Half as number) < 50) {
      return NextResponse.json({ error: "1/3~1/2 수강 시 환불 비율은 50% 이상이어야 합니다." }, { status: 400 });
    }

    // Read current config and merge
    const current = await getSystemConfig();
    const merged = {
      ...DEFAULT_SYSTEM_CONFIG,
      ...current,
      refundBeforeStart: refundBeforeStart as number,
      refundBefore1Third: refundBefore1Third as number,
      refundBefore1Half: refundBefore1Half as number,
      refundAfter1Half: refundAfter1Half as number,
    };

    const updated = await getPrisma().systemConfig.upsert({
      where: { id: "singleton" },
      update: {
        data: merged as object,
        updatedBy: auth.context.adminUser.id,
      },
      create: {
        id: "singleton",
        data: merged as object,
        updatedBy: auth.context.adminUser.id,
      },
      select: {
        data: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      data: {
        refundBeforeStart: refundBeforeStart as number,
        refundBefore1Third: refundBefore1Third as number,
        refundBefore1Half: refundBefore1Half as number,
        refundAfter1Half: refundAfter1Half as number,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "저장 실패" },
      { status: 400 },
    );
  }
}
