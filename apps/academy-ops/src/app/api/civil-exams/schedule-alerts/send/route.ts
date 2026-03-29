import { AdminRole, NotificationChannel, NotificationType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest) {
  const auth = await requireApiAdmin(AdminRole.MANAGER);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const prisma = getPrisma();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 30);

    // Find active civil service exams with at least one date within 30 days
    const upcomingExams = await prisma.civilServiceExam.findMany({
      where: {
        isActive: true,
        OR: [
          { writtenDate: { gte: today, lte: cutoff } },
          { interviewDate: { gte: today, lte: cutoff } },
          { resultDate: { gte: today, lte: cutoff } },
        ],
      },
      orderBy: { writtenDate: "asc" },
    });

    if (upcomingExams.length === 0) {
      return NextResponse.json({
        data: { count: 0, examCount: 0, message: "발송할 시험 일정이 없습니다." },
      });
    }

    // Find all students with notification consent who are active
    const students = await prisma.student.findMany({
      where: {
        isActive: true,
        notificationConsent: true,
      },
      select: { examNumber: true },
    });

    if (students.length === 0) {
      return NextResponse.json({
        data: { count: 0, examCount: upcomingExams.length, message: "알림 동의 학생이 없습니다." },
      });
    }

    // Build notification records: one per (student, exam)
    const EXAM_TYPE_LABELS: Record<string, string> = {
      GONGCHAE: "공채",
      GYEONGCHAE: "경채",
    };

    function formatDateKR(d: Date | null): string {
      if (!d) return "";
      return d.toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }

    function buildMessage(exam: (typeof upcomingExams)[number]): string {
      const typeLabel = EXAM_TYPE_LABELS[exam.examType] ?? exam.examType;
      const parts: string[] = [`[${exam.year}년 경찰 ${typeLabel}] ${exam.name}`];
      if (exam.writtenDate) {
        const days = Math.round(
          (exam.writtenDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (days >= 0) {
          parts.push(`필기시험: ${formatDateKR(exam.writtenDate)} (D-${days})`);
        }
      }
      if (exam.interviewDate) {
        const days = Math.round(
          (exam.interviewDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (days >= 0) {
          parts.push(`면접시험: ${formatDateKR(exam.interviewDate)} (D-${days})`);
        }
      }
      if (exam.description) {
        parts.push(exam.description);
      }
      return parts.join(" | ");
    }

    // Create notification logs in batches to avoid oversized transactions
    const BATCH_SIZE = 200;
    let totalCreated = 0;

    for (const exam of upcomingExams) {
      const message = buildMessage(exam);

      for (let i = 0; i < students.length; i += BATCH_SIZE) {
        const batch = students.slice(i, i + BATCH_SIZE);
        const records = batch.map((s) => ({
          examNumber: s.examNumber,
          type: NotificationType.NOTICE,
          channel: NotificationChannel.WEB_PUSH,
          message,
          status: "sent",
          isRead: false,
        }));

        const result = await prisma.notificationLog.createMany({
          data: records,
          skipDuplicates: true,
        });
        totalCreated += result.count;
      }
    }

    return NextResponse.json({
      data: {
        count: totalCreated,
        examCount: upcomingExams.length,
        studentCount: students.length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "알림 발송 실패" },
      { status: 500 },
    );
  }
}
