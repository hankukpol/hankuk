import { AdminRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

/**
 * POST /api/enrollments/bulk
 * Bulk update enrollment status.
 * Required role: DIRECTOR (AdminRole.DIRECTOR)
 *
 * Body: { action: "complete", ids: string[] }
 * Response: { updatedCount: number, skippedIds: string[] }
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.DIRECTOR);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const { action, ids } = body as { action: string; ids: string[] };

    if (action !== "complete") {
      return NextResponse.json({ error: "지원하지 않는 작업입니다." }, { status: 400 });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "수강 ID 목록을 입력하세요." }, { status: 400 });
    }

    if (ids.length > 200) {
      return NextResponse.json({ error: "한 번에 최대 200건까지 처리할 수 있습니다." }, { status: 400 });
    }

    // Only ACTIVE or SUSPENDED enrollments can be marked COMPLETED
    const eligibleStatuses = ["ACTIVE", "SUSPENDED"];

    const prisma = getPrisma();

    // Fetch existing enrollments to determine eligibility
    const existing = await prisma.courseEnrollment.findMany({
      where: { id: { in: ids } },
      select: { id: true, status: true },
    });

    const eligibleIds = existing
      .filter((e) => eligibleStatuses.includes(e.status))
      .map((e) => e.id);

    const skippedIds = ids.filter((id) => !eligibleIds.includes(id));

    if (eligibleIds.length === 0) {
      return NextResponse.json({
        updatedCount: 0,
        skippedIds,
        message: "완료 처리할 수 있는 수강 내역이 없습니다. (수강 중 또는 휴원 상태만 완료 처리 가능)",
      });
    }

    // Bulk update
    await prisma.$transaction(async (tx) => {
      await tx.courseEnrollment.updateMany({
        where: { id: { in: eligibleIds } },
        data: { status: "COMPLETED" },
      });

      // Write audit logs
      await tx.auditLog.createMany({
        data: eligibleIds.map((id) => {
          const prev = existing.find((e) => e.id === id);
          return {
            adminId: auth.context.adminUser.id,
            action: "BULK_COMPLETE_ENROLLMENT",
            targetType: "courseEnrollment",
            targetId: id,
            before: { status: prev?.status ?? "UNKNOWN" },
            after: { status: "COMPLETED" },
            ipAddress: request.headers.get("x-forwarded-for"),
          };
        }),
      });
    });

    return NextResponse.json({
      updatedCount: eligibleIds.length,
      skippedIds,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "처리 실패" },
      { status: 400 },
    );
  }
}
