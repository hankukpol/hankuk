import { AdminRole, ExamType, NotificationType, StudentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import {
  previewManualNotification,
  previewQueuedNotifications,
  sendManualNotification,
  sendQueuedNotifications,
  sendStatusNotifications,
} from "@/lib/notifications/service";

type TargetMode = "student" | "cohort" | "all_active";

type RequestBody = {
  preview?: boolean;
  logIds?: number[];
  type?: NotificationType;
  message?: string;
  examType?: ExamType;
  examNumbers?: string[];
  pointAmount?: number | null;
  periodId?: number;
  statuses?: StudentStatus[];
  // Manual send extensions
  target?: TargetMode;
  cohortId?: string;
};

/**
 * Resolve exam numbers for cohort / all_active targets.
 */
async function resolveExamNumbersForTarget(
  target: TargetMode,
  opts: { cohortId?: string; examNumbers?: string[] },
): Promise<string[] | undefined> {
  if (target === "student") {
    // examNumbers supplied directly from caller
    return opts.examNumbers;
  }

  const prisma = getPrisma();

  if (target === "cohort" && opts.cohortId) {
    // Get all ACTIVE / PENDING enrollments for the cohort
    const enrollments = await prisma.courseEnrollment.findMany({
      where: {
        cohortId: opts.cohortId,
        status: { in: ["ACTIVE", "PENDING"] },
      },
      select: { examNumber: true },
    });
    return enrollments.map((e) => e.examNumber);
  }

  if (target === "all_active") {
    // All isActive students with notification consent
    const students = await prisma.student.findMany({
      where: { isActive: true, notificationConsent: true },
      select: { examNumber: true },
    });
    return students.map((s) => s.examNumber);
  }

  return undefined;
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;
    const logIds =
      body.logIds?.map((value) => Number(value)).filter((value) => Number.isInteger(value)) ?? [];

    // ── Queued notification preview ─────────────────────────────────────────
    if (body.preview && logIds.length > 0) {
      const result = await previewQueuedNotifications({ logIds });
      return NextResponse.json(result);
    }

    // ── Manual notification preview ─────────────────────────────────────────
    if (body.preview) {
      const target = body.target ?? "student";
      const resolvedExamNumbers = await resolveExamNumbersForTarget(target, {
        cohortId: body.cohortId,
        examNumbers: body.examNumbers?.map((v) => String(v).trim()).filter(Boolean),
      });

      const result = await previewManualNotification({
        type: body.type ?? NotificationType.NOTICE,
        message: body.message,
        examType: body.examType,
        examNumbers: resolvedExamNumbers,
        pointAmount:
          body.pointAmount === null || body.pointAmount === undefined
            ? null
            : Number(body.pointAmount),
      });

      return NextResponse.json(result);
    }

    // ── Send queued notifications ───────────────────────────────────────────
    if (logIds.length > 0) {
      const result = await sendQueuedNotifications({
        adminId: auth.context.adminUser.id,
        logIds,
        ipAddress: request.headers.get("x-forwarded-for"),
      });

      return NextResponse.json(result);
    }

    // ── Send status-based notifications ────────────────────────────────────
    const statuses =
      body.statuses?.filter(
        (value) =>
          value === StudentStatus.WARNING_1 ||
          value === StudentStatus.WARNING_2 ||
          value === StudentStatus.DROPOUT,
      ) ?? [];
    const periodId = Number(body.periodId);

    if (statuses.length > 0 && Number.isInteger(periodId)) {
      const result = await sendStatusNotifications({
        adminId: auth.context.adminUser.id,
        periodId,
        examType: body.examType ?? ExamType.GONGCHAE,
        statuses,
        ipAddress: request.headers.get("x-forwarded-for"),
      });

      return NextResponse.json(result);
    }

    // ── Manual notification send (student / cohort / all_active) ────────────
    const target = body.target ?? "student";
    const resolvedExamNumbers = await resolveExamNumbersForTarget(target, {
      cohortId: body.cohortId,
      examNumbers: body.examNumbers?.map((v) => String(v).trim()).filter(Boolean),
    });

    const result = await sendManualNotification({
      adminId: auth.context.adminUser.id,
      type: body.type ?? NotificationType.NOTICE,
      message: body.message,
      examType: body.examType,
      examNumbers: resolvedExamNumbers,
      pointAmount:
        body.pointAmount === null || body.pointAmount === undefined
          ? null
          : Number(body.pointAmount),
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "알림 발송에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
