import { AdminRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/api-auth";
import { getPrisma } from "@/lib/prisma";

export type InboxItemType =
  | "ABSENCE_NOTE_PENDING"
  | "SCORE_MISSING"
  | "NOTIFICATION_FAILED"
  | "INSTALLMENT_OVERDUE"
  | "ENROLLMENT_EXPIRING";

export type InboxItemPriority = "HIGH" | "MEDIUM" | "LOW";

export interface InboxItem {
  id: string;
  type: InboxItemType;
  title: string;
  description: string;
  href: string;
  priority: InboxItemPriority;
  count?: number;
  createdAt?: string;
}

export interface AdminDashboardInboxResponse {
  items: InboxItem[];
  totalCount: number;
  lastUpdated: string;
}

const PRIORITY_ORDER: Record<InboxItemPriority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

export async function GET() {
  const auth = await requireApiAdmin(AdminRole.COUNSELOR);

  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const prisma = getPrisma();
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const in7Days = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const items: InboxItem[] = [];

  // 1. 결석계 미처리 (ABSENCE_NOTE_PENDING)
  await (async () => {
    const count = await prisma.absenceNote.count({
      where: { status: "PENDING" },
    });
    if (count > 0) {
      items.push({
        id: "absence-note-pending",
        type: "ABSENCE_NOTE_PENDING",
        title: "결석계 미처리",
        description: `검토 대기 중인 결석계가 ${count}건 있습니다.`,
        href: "/admin/absence-notes?status=PENDING",
        priority: "HIGH",
        count,
        createdAt: now.toISOString(),
      });
    }
  })().catch(() => {
    // model may not be available — skip gracefully
  });

  // 2. 오늘 성적 미입력 (SCORE_MISSING)
  await (async () => {
    const todaySessions = await prisma.examSession.findMany({
      where: {
        isCancelled: false,
        examDate: { gte: todayStart, lte: todayEnd },
      },
      select: {
        id: true,
        _count: { select: { scores: true } },
      },
    });

    const missingSessions = todaySessions.filter((s) => s._count.scores === 0);
    if (missingSessions.length > 0) {
      items.push({
        id: "score-missing-today",
        type: "SCORE_MISSING",
        title: "오늘 성적 미입력",
        description: `오늘 예정된 ${todaySessions.length}개 회차 중 ${missingSessions.length}개 회차의 성적이 입력되지 않았습니다.`,
        href: "/admin/scores/input",
        priority: "HIGH",
        count: missingSessions.length,
        createdAt: now.toISOString(),
      });
    }
  })().catch(() => {
    // skip gracefully
  });

  // 3. 알림 발송 실패 (NOTIFICATION_FAILED)
  await (async () => {
    const count = await prisma.notificationLog.count({
      where: {
        status: "failed",
        sentAt: { gte: sevenDaysAgo },
      },
    });
    if (count > 0) {
      items.push({
        id: "notification-failed",
        type: "NOTIFICATION_FAILED",
        title: "알림 발송 실패",
        description: `최근 7일간 발송 실패한 알림이 ${count}건 있습니다.`,
        href: "/admin/notifications",
        priority: "MEDIUM",
        count,
        createdAt: now.toISOString(),
      });
    }
  })().catch(() => {
    // skip gracefully
  });

  // 4. 연체 설치금 (INSTALLMENT_OVERDUE)
  await (async () => {
    const count = await prisma.installment.count({
      where: {
        paidAt: null,
        dueDate: { lte: todayStart },
      },
    });
    if (count > 0) {
      items.push({
        id: "installment-overdue",
        type: "INSTALLMENT_OVERDUE",
        title: "연체 설치금",
        description: `납부 기한이 지난 미납 분할납부가 ${count}건 있습니다.`,
        href: "/admin/payments/unpaid",
        priority: "HIGH",
        count,
        createdAt: now.toISOString(),
      });
    }
  })().catch(() => {
    // skip gracefully
  });

  // 5. 수강 만료 임박 7일 (ENROLLMENT_EXPIRING)
  await (async () => {
    const count = await prisma.cohort.count({
      where: {
        isActive: true,
        endDate: { gte: todayStart, lte: in7Days },
      },
    });
    if (count > 0) {
      items.push({
        id: "enrollment-expiring",
        type: "ENROLLMENT_EXPIRING",
        title: "수강 만료 임박",
        description: `7일 이내에 종료되는 기수가 ${count}개 있습니다.`,
        href: "/admin/cohorts",
        priority: "MEDIUM",
        count,
        createdAt: now.toISOString(),
      });
    }
  })().catch(() => {
    // skip gracefully
  });

  // Sort by priority (HIGH first), then limit to 10
  items.sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
  );

  const result: AdminDashboardInboxResponse = {
    items: items.slice(0, 10),
    totalCount: items.length,
    lastUpdated: now.toISOString(),
  };

  return NextResponse.json({ data: result });
}
