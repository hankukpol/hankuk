import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { AdminRole, EnrollmentStatus } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiAdmin(AdminRole.VIEWER);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const prisma = getPrisma();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const in3Days = new Date(todayStart.getTime() + 3 * 24 * 60 * 60 * 1000);
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [overdueInstallments, pendingRefunds, dueMemos, expiringEnrollments] = await Promise.all([
    // 오늘 마감 분할납부 미납 건
    prisma.installment.findMany({
      where: {
        paidAt: null,
        dueDate: { gte: todayStart, lte: todayEnd },
      },
      include: {
        payment: {
          select: {
            examNumber: true,
            student: { select: { name: true, examNumber: true } },
          },
        },
      },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),

    // PENDING 상태 환불 건
    prisma.refund.findMany({
      where: { status: "PENDING" },
      include: {
        payment: {
          select: {
            examNumber: true,
            student: { select: { name: true, examNumber: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),

    // 오늘 ~ +3일 이내 마감 메모
    prisma.adminMemo.findMany({
      where: {
        dueAt: { gte: todayStart, lte: in3Days },
        status: { not: "DONE" },
      },
      orderBy: { dueAt: "asc" },
      take: 10,
    }),

    // 7일 이내 만료 예정 수강 (ACTIVE 상태)
    prisma.courseEnrollment.findMany({
      where: {
        status: EnrollmentStatus.ACTIVE,
        endDate: {
          lte: in7Days,
          gte: new Date(),
        },
      },
      select: {
        id: true,
        endDate: true,
        student: { select: { name: true, examNumber: true } },
        cohort: { select: { name: true } },
      },
      orderBy: { endDate: "asc" },
      take: 10,
    }),
  ]);

  type TodoItem = {
    id: string;
    type: "OVERDUE_INSTALLMENT" | "PENDING_REFUND" | "DUE_MEMO" | "EXPIRING_ENROLLMENT";
    label: string;
    subLabel: string;
    urgency: "high" | "medium" | "low";
    href: string;
    dueDate?: string;
  };

  const todos: TodoItem[] = [];

  for (const inst of overdueInstallments) {
    const studentName = inst.payment.student?.name ?? "학생미상";
    const examNumber = inst.payment.examNumber ?? "";
    todos.push({
      id: `installment-${inst.id}`,
      type: "OVERDUE_INSTALLMENT",
      label: `${studentName} 분할납부 미납 확인 (오늘 마감)`,
      subLabel: `${inst.amount.toLocaleString()}원 / ${examNumber}`,
      urgency: "high",
      href: "/admin/payments/unpaid",
      dueDate: inst.dueDate.toISOString(),
    });
  }

  for (const refund of pendingRefunds) {
    const studentName = refund.payment.student?.name ?? "학생미상";
    const examNumber = refund.payment.examNumber ?? "";
    todos.push({
      id: `refund-${refund.id}`,
      type: "PENDING_REFUND",
      label: `${studentName} 환불 승인 대기`,
      subLabel: `${refund.amount.toLocaleString()}원 / ${examNumber}`,
      urgency: "medium",
      href: `/admin/payments/${refund.paymentId}`,
      dueDate: refund.createdAt.toISOString(),
    });
  }

  for (const memo of dueMemos) {
    const dueText = memo.dueAt
      ? new Date(memo.dueAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "";
    todos.push({
      id: `memo-${memo.id}`,
      type: "DUE_MEMO",
      label: memo.title,
      subLabel: dueText,
      urgency: "medium",
      href: "/admin/memos",
      dueDate: memo.dueAt?.toISOString(),
    });
  }

  for (const enroll of expiringEnrollments) {
    const studentName = enroll.student.name;
    const examNumber = enroll.student.examNumber;
    const cohortName = enroll.cohort?.name ?? "";
    const endText = enroll.endDate
      ? new Date(enroll.endDate).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })
      : "";
    todos.push({
      id: `expiring-${enroll.id}`,
      type: "EXPIRING_ENROLLMENT",
      label: `${studentName} 수강 만료 예정`,
      subLabel: cohortName ? `${cohortName} / 만료일: ${endText} / ${examNumber}` : `만료일: ${endText} / ${examNumber}`,
      urgency: "medium",
      href: `/admin/enrollments/${enroll.id}`,
      dueDate: enroll.endDate?.toISOString(),
    });
  }

  return NextResponse.json({
    data: {
      todos,
      counts: {
        overdueInstallments: overdueInstallments.length,
        pendingRefunds: pendingRefunds.length,
        dueMemos: dueMemos.length,
        expiringEnrollments: expiringEnrollments.length,
      },
    },
  });
}
