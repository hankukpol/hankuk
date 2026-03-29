import { AdminRole, EnrollmentStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

// Valid status transitions map
const ALLOWED_TRANSITIONS: Partial<Record<EnrollmentStatus, EnrollmentStatus[]>> = {
  ACTIVE: [EnrollmentStatus.WITHDRAWN, EnrollmentStatus.COMPLETED, EnrollmentStatus.SUSPENDED],
  SUSPENDED: [EnrollmentStatus.ACTIVE, EnrollmentStatus.WITHDRAWN, EnrollmentStatus.COMPLETED],
  WAITING: [EnrollmentStatus.ACTIVE, EnrollmentStatus.WITHDRAWN],
  PENDING: [EnrollmentStatus.ACTIVE, EnrollmentStatus.WITHDRAWN, EnrollmentStatus.CANCELLED],
};

type RequestBody = {
  enrollmentIds: string[];
  newStatus: EnrollmentStatus;
};

/**
 * POST /api/enrollments/bulk-status
 * 수강 내역 일괄 상태 변경.
 * Body: { enrollmentIds: string[], newStatus: EnrollmentStatus }
 * Auth: AdminRole.MANAGER+
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = (await request.json()) as Partial<RequestBody>;
    const { enrollmentIds, newStatus } = body;

    if (!Array.isArray(enrollmentIds) || enrollmentIds.length === 0) {
      return NextResponse.json({ error: "수강 ID 목록을 입력하세요." }, { status: 400 });
    }

    if (enrollmentIds.length > 200) {
      return NextResponse.json(
        { error: "한 번에 최대 200건까지 처리할 수 있습니다." },
        { status: 400 },
      );
    }

    if (!newStatus || !Object.values(EnrollmentStatus).includes(newStatus)) {
      return NextResponse.json({ error: "유효하지 않은 상태값입니다." }, { status: 400 });
    }

    const prisma = getPrisma();

    // Fetch existing enrollments
    const existing = await prisma.courseEnrollment.findMany({
      where: { id: { in: enrollmentIds } },
      select: { id: true, status: true, examNumber: true },
    });

    // Filter by valid transitions
    const eligibleIds: string[] = [];
    const skippedIds: string[] = [];
    const skippedReasons: Record<string, string> = {};

    for (const enrollment of existing) {
      const allowed = ALLOWED_TRANSITIONS[enrollment.status];
      if (allowed && allowed.includes(newStatus)) {
        eligibleIds.push(enrollment.id);
      } else {
        skippedIds.push(enrollment.id);
        skippedReasons[enrollment.id] =
          `${enrollment.status} → ${newStatus} 전환 불가`;
      }
    }

    // IDs not found in DB
    const foundIds = new Set(existing.map((e) => e.id));
    for (const id of enrollmentIds) {
      if (!foundIds.has(id)) {
        skippedIds.push(id);
        skippedReasons[id] = "수강 내역을 찾을 수 없습니다.";
      }
    }

    if (eligibleIds.length === 0) {
      return NextResponse.json({
        updatedCount: 0,
        skippedIds,
        skippedReasons,
        message: "처리 가능한 수강 내역이 없습니다.",
      });
    }

    // Determine audit action name
    const actionMap: Partial<Record<EnrollmentStatus, string>> = {
      WITHDRAWN: "BULK_WITHDRAW_ENROLLMENT",
      COMPLETED: "BULK_COMPLETE_ENROLLMENT",
      SUSPENDED: "BULK_SUSPEND_ENROLLMENT",
      ACTIVE: "BULK_REINSTATE_ENROLLMENT",
      CANCELLED: "BULK_CANCEL_ENROLLMENT",
    };
    const auditAction = actionMap[newStatus] ?? "BULK_STATUS_CHANGE_ENROLLMENT";

    await prisma.$transaction(async (tx) => {
      await tx.courseEnrollment.updateMany({
        where: { id: { in: eligibleIds } },
        data: { status: newStatus },
      });

      await tx.auditLog.createMany({
        data: eligibleIds.map((id) => {
          const prev = existing.find((e) => e.id === id);
          return {
            adminId: auth.context.adminUser.id,
            action: auditAction,
            targetType: "courseEnrollment",
            targetId: id,
            before: { status: prev?.status ?? "UNKNOWN" },
            after: { status: newStatus },
            ipAddress: request.headers.get("x-forwarded-for"),
          };
        }),
      });
    });

    return NextResponse.json({
      updatedCount: eligibleIds.length,
      skippedIds,
      skippedReasons,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "처리 실패" },
      { status: 400 },
    );
  }
}
