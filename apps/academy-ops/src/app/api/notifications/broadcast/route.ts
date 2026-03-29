import { AdminRole, NotificationChannel, NotificationType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";
import {
  renderNotificationMessageFromTemplate,
  getResolvedNotificationTemplate,
} from "@/lib/notifications/template-service";
import { sendQueuedNotifications } from "@/lib/notifications/service";
import { normalizePhone } from "@/lib/excel/workbook";

type RecipientGroup =
  | "all_active"
  | "cohort"
  | "exam_category"
  | "overdue_installment"
  | "absent_3plus"
  | "custom";

type RequestBody = {
  templateId: string;
  recipientGroup: RecipientGroup;
  cohortId?: string;
  examCategory?: string;
  examNumbers?: string[];
  countOnly?: boolean;
};

/**
 * Resolve exam numbers for the broadcast, filtered to students with notification consent.
 */
async function resolveBroadcastRecipients(
  recipientGroup: RecipientGroup,
  opts: {
    cohortId?: string;
    examCategory?: string;
    examNumbers?: string[];
  },
): Promise<{ students: Array<{ examNumber: string; name: string; phone: string | null; notificationConsent: boolean }>; missingNumbers: string[] }> {
  const prisma = getPrisma();

  if (recipientGroup === "custom" && opts.examNumbers?.length) {
    const normalizedNumbers = opts.examNumbers
      .map((n) => n.trim())
      .filter(Boolean);

    const students = await prisma.student.findMany({
      where: {
        examNumber: { in: normalizedNumbers },
        isActive: true,
        notificationConsent: true,
      },
      select: {
        examNumber: true,
        name: true,
        phone: true,
        notificationConsent: true,
      },
    });

    const foundNumbers = new Set(students.map((s) => s.examNumber));
    const missingNumbers = normalizedNumbers.filter((n) => !foundNumbers.has(n));

    return { students, missingNumbers };
  }

  if (recipientGroup === "cohort" && opts.cohortId) {
    // Get enrollments in the cohort with ACTIVE or PENDING status
    const enrollments = await prisma.courseEnrollment.findMany({
      where: {
        cohortId: opts.cohortId,
        status: { in: ["ACTIVE", "PENDING"] },
      },
      select: { examNumber: true },
    });

    const examNumbers = Array.from(new Set(enrollments.map((e) => e.examNumber)));

    const students = await prisma.student.findMany({
      where: {
        examNumber: { in: examNumbers },
        isActive: true,
        notificationConsent: true,
      },
      select: {
        examNumber: true,
        name: true,
        phone: true,
        notificationConsent: true,
      },
    });

    return { students, missingNumbers: [] };
  }

  if (recipientGroup === "exam_category" && opts.examCategory) {
    // Map ExamCategory to ExamType for student lookup
    const examTypeMap: Record<string, string> = {
      GONGCHAE: "GONGCHAE",
      GYEONGCHAE: "GYEONGCHAE",
    };
    const examType = examTypeMap[opts.examCategory];

    const students = await prisma.student.findMany({
      where: {
        ...(examType ? { examType: examType as "GONGCHAE" | "GYEONGCHAE" } : {}),
        isActive: true,
        notificationConsent: true,
        courseEnrollments: {
          some: { status: { in: ["ACTIVE", "PENDING"] } },
        },
      },
      select: {
        examNumber: true,
        name: true,
        phone: true,
        notificationConsent: true,
      },
    });

    return { students, missingNumbers: [] };
  }

  if (recipientGroup === "overdue_installment") {
    // Students with at least one UNPAID installment past due date
    const today = new Date();
    const overdueInstallments = await prisma.installment.findMany({
      where: {
        dueDate: { lt: today },
        paidAt: null,
        payment: {
          examNumber: { not: null },
          student: {
            isActive: true,
            notificationConsent: true,
          },
        },
      },
      select: {
        payment: {
          select: {
            examNumber: true,
          },
        },
      },
    });

    const overdueExamNumbers = [
      ...new Set(
        overdueInstallments
          .map((i) => i.payment.examNumber)
          .filter((n): n is string => n !== null),
      ),
    ];

    if (overdueExamNumbers.length === 0) {
      return { students: [], missingNumbers: [] };
    }

    const students = await prisma.student.findMany({
      where: {
        examNumber: { in: overdueExamNumbers },
        isActive: true,
        notificationConsent: true,
      },
      select: {
        examNumber: true,
        name: true,
        phone: true,
        notificationConsent: true,
      },
    });

    return { students, missingNumbers: [] };
  }

  if (recipientGroup === "absent_3plus") {
    // Students with 3 or more ABSENT scores in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const absentScores = await prisma.score.groupBy({
      by: ["examNumber"],
      where: {
        attendType: "ABSENT",
        session: {
          examDate: { gte: thirtyDaysAgo },
        },
      },
      _count: { examNumber: true },
      having: {
        examNumber: { _count: { gte: 3 } },
      },
    });

    const absentExamNumbers = absentScores.map((s) => s.examNumber);

    if (absentExamNumbers.length === 0) {
      return { students: [], missingNumbers: [] };
    }

    const students = await prisma.student.findMany({
      where: {
        examNumber: { in: absentExamNumbers },
        isActive: true,
        notificationConsent: true,
      },
      select: {
        examNumber: true,
        name: true,
        phone: true,
        notificationConsent: true,
      },
    });

    return { students, missingNumbers: [] };
  }

  // all_active: all active students with consent and active enrollment
  const students = await prisma.student.findMany({
    where: {
      isActive: true,
      notificationConsent: true,
      courseEnrollments: {
        some: { status: { in: ["ACTIVE", "PENDING"] } },
      },
    },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      notificationConsent: true,
    },
    orderBy: [{ examNumber: "asc" }],
  });

  return { students, missingNumbers: [] };
}

export async function POST(request: Request) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = (await request.json()) as RequestBody;

    const { templateId, recipientGroup, cohortId, examCategory, examNumbers, countOnly } = body;

    if (!templateId) {
      return NextResponse.json({ error: "템플릿을 선택해 주세요." }, { status: 400 });
    }

    if (!recipientGroup) {
      return NextResponse.json({ error: "수신 대상 그룹을 선택해 주세요." }, { status: 400 });
    }

    // Fetch the template
    const prisma = getPrisma();
    const templateRow = await prisma.notificationTemplate.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        type: true,
        channel: true,
      },
    });

    if (!templateRow) {
      return NextResponse.json({ error: "템플릿을 찾을 수 없습니다." }, { status: 404 });
    }

    // Resolve recipients
    const { students, missingNumbers } = await resolveBroadcastRecipients(
      recipientGroup,
      {
        cohortId,
        examCategory,
        examNumbers: examNumbers?.map((n) => String(n).trim()).filter(Boolean),
      },
    );

    // Filter students without a valid phone number
    const validStudents = students.filter((s) => Boolean(normalizePhone(s.phone ?? "")));

    // Count-only mode: return recipient count without sending
    if (countOnly) {
      return NextResponse.json({
        count: validStudents.length,
        missingNumbers,
      });
    }

    if (validStudents.length === 0) {
      return NextResponse.json(
        { error: "발송 가능한 수신자가 없습니다. 수신 동의 및 연락처를 확인해 주세요." },
        { status: 400 },
      );
    }

    // Resolve the full template for rendering
    const resolvedTemplate = await getResolvedNotificationTemplate(
      templateRow.type as NotificationType,
      templateRow.channel as NotificationChannel,
    );

    // Create notification logs for each recipient
    const createdLogs: { id: number }[] = [];

    for (const student of validStudents) {
      const rendered = renderNotificationMessageFromTemplate(resolvedTemplate, {
        type: templateRow.type as NotificationType,
        studentName: student.name,
      });

      const log = await prisma.notificationLog.create({
        data: {
          examNumber: student.examNumber,
          type: templateRow.type as NotificationType,
          channel: NotificationChannel.ALIMTALK,
          message: rendered.message,
          templateVariables: rendered.variables ?? undefined,
          status: "pending",
        },
        select: { id: true },
      });

      createdLogs.push(log);
    }

    if (createdLogs.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0, skipped: 0 });
    }

    // Send all queued notifications
    const result = await sendQueuedNotifications({
      adminId: auth.context.adminUser.id,
      logIds: createdLogs.map((log) => log.id),
      ipAddress: request.headers.get("x-forwarded-for"),
    });

    return NextResponse.json({
      sent: result.sentCount,
      failed: result.failedCount,
      skipped: result.skippedCount,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "일괄 발송에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
