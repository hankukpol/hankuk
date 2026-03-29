import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoute } from "@/lib/admin-auth";
import { requireAdminSiteFeature } from "@/lib/admin-site-features";
import { revalidateEventsCache } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import { getServerTenantType } from "@/lib/tenant.server";

export const runtime = "nodejs";

interface ReorderPayload {
  eventIds?: unknown;
}

function parseEventIds(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 1) {
    return null;
  }

  const parsed: number[] = [];
  const unique = new Set<number>();

  for (const item of value) {
    const asNumber =
      typeof item === "number"
        ? item
        : typeof item === "string" && item.trim().length > 0
          ? Number(item)
          : NaN;

    if (!Number.isInteger(asNumber) || asNumber <= 0 || unique.has(asNumber)) {
      return null;
    }

    unique.add(asNumber);
    parsed.push(asNumber);
  }

  return parsed;
}

export async function PUT(request: NextRequest) {
  const guard = await requireAdminRoute();
  if ("error" in guard) return guard.error;
  const featureError = await requireAdminSiteFeature("events");
  if (featureError) return featureError;

  const tenantType = await getServerTenantType();

  try {
    const body = (await request.json()) as ReorderPayload;
    const eventIds = parseEventIds(body.eventIds);
    if (!eventIds) {
      return NextResponse.json(
        { error: "정렬 순서 데이터가 올바르지 않습니다. eventIds 배열을 확인해 주세요." },
        { status: 400 }
      );
    }

    const existing = await prisma.eventSection.findMany({
      where: {
        id: {
          in: eventIds,
        },
        tenantType,
      },
      select: {
        id: true,
      },
    });

    if (existing.length !== eventIds.length) {
      return NextResponse.json({ error: "존재하지 않거나 다른 직렬의 이벤트가 포함되어 있습니다." }, { status: 404 });
    }

    await prisma.$transaction(
      eventIds.map((id, index) =>
        prisma.eventSection.update({
          where: { id },
          data: {
            sortOrder: index,
          },
        })
      )
    );

    revalidateEventsCache(tenantType);

    return NextResponse.json({
      success: true,
      updatedCount: eventIds.length,
      message: "이벤트 순서가 저장되었습니다.",
    });
  } catch (error) {
    console.error("이벤트 순서 변경 중 오류가 발생했습니다.", error);
    return NextResponse.json({ error: "이벤트 순서 변경에 실패했습니다." }, { status: 500 });
  }
}
