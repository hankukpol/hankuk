import { AbsenceStatus, ExamType, NotificationChannel } from "@prisma/client";
import { buildPeriodScopedStudentWhere } from "@/lib/analytics/data";
import { EXAM_TYPE_LABEL, NOTIFICATION_TYPE_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";

const MAX_ITEMS_PER_GROUP = 8;
const FAILED_LOG_WINDOW_DAYS = 7;
const DASHBOARD_RETRYABLE_CHANNELS = [
  NotificationChannel.ALIMTALK,
  NotificationChannel.SMS,
] as const;

type DashboardInboxOptions = {
  includeFailedNotifications?: boolean;
};

export type DashboardInboxItem = {
  id: string;
  type: "ABSENCE_NOTE_PENDING" | "NOTIFICATION_FAILED" | "SCORE_MISSING";
  title: string;
  description: string;
  actionUrl: string;
  actionLabel: string;
  createdAt: string;
  createdAtLabel: string;
  retryPayload?: {
    notificationLogId: number;
  };
};

export type DashboardInboxData = {
  periodId: number | null;
  total: number;
  counts: {
    pendingAbsenceNotes: number;
    failedNotifications: number;
    missingScores: number;
  };
  items: DashboardInboxItem[];
};

function startOfToday(now = new Date()) {
  const value = new Date(now);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfToday(now = new Date()) {
  const value = new Date(now);
  value.setHours(23, 59, 59, 999);
  return value;
}

function subtractDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() - days);
  return value;
}

export async function listDashboardInboxData(
  options?: DashboardInboxOptions,
): Promise<DashboardInboxData> {
  const prisma = getPrisma();
  const includeFailedNotifications = options?.includeFailedNotifications ?? true;
  const activePeriod = await prisma.examPeriod.findFirst({
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
    select: {
      id: true,
    },
  });

  if (!activePeriod) {
    return {
      periodId: null,
      total: 0,
      counts: {
        pendingAbsenceNotes: 0,
        failedNotifications: 0,
        missingScores: 0,
      },
      items: [],
    };
  }

  const todayStart = startOfToday();
  const todayEnd = endOfToday();
  const failedWindowStart = subtractDays(todayStart, FAILED_LOG_WINDOW_DAYS);

  const [gongchaeCount, gyeongchaeCount, pendingAbsenceCount, pendingAbsenceNotes, todaySessions] =
    await Promise.all([
      prisma.student.count({
        where: {
          ...buildPeriodScopedStudentWhere(activePeriod.id, ExamType.GONGCHAE),
          isActive: true,
        },
      }),
      prisma.student.count({
        where: {
          ...buildPeriodScopedStudentWhere(activePeriod.id, ExamType.GYEONGCHAE),
          isActive: true,
        },
      }),
      prisma.absenceNote.count({
        where: {
          status: AbsenceStatus.PENDING,
          session: {
            periodId: activePeriod.id,
          },
        },
      }),
      prisma.absenceNote.findMany({
        where: {
          status: AbsenceStatus.PENDING,
          session: {
            periodId: activePeriod.id,
          },
        },
        select: {
          id: true,
          reason: true,
          submittedAt: true,
          createdAt: true,
          student: {
            select: {
              name: true,
            },
          },
          session: {
            select: {
              examType: true,
              examDate: true,
              subject: true,
            },
          },
        },
        orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
        take: MAX_ITEMS_PER_GROUP,
      }),
      prisma.examSession.findMany({
        where: {
          periodId: activePeriod.id,
          isCancelled: false,
          examDate: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
        select: {
          id: true,
          examType: true,
          week: true,
          subject: true,
          examDate: true,
          _count: {
            select: {
              scores: true,
            },
          },
        },
        orderBy: {
          examDate: "asc",
        },
      }),
    ]);

  const [failedNotificationCount, failedNotifications] = includeFailedNotifications
    ? await Promise.all([
        prisma.notificationLog.count({
          where: {
            status: "failed",
            channel: {
              in: [...DASHBOARD_RETRYABLE_CHANNELS],
            },
            sentAt: {
              gte: failedWindowStart,
            },
          },
        }),
        prisma.notificationLog.findMany({
          where: {
            status: "failed",
            channel: {
              in: [...DASHBOARD_RETRYABLE_CHANNELS],
            },
            sentAt: {
              gte: failedWindowStart,
            },
          },
          select: {
            id: true,
            type: true,
            failReason: true,
            message: true,
            sentAt: true,
            student: {
              select: {
                name: true,
              },
            },
          },
          orderBy: {
            sentAt: "desc",
          },
          take: MAX_ITEMS_PER_GROUP,
        }),
      ])
    : [0, [] as Array<{
        id: number;
        type: keyof typeof NOTIFICATION_TYPE_LABEL;
        failReason: string | null;
        message: string;
        sentAt: Date;
        student: {
          name: string;
        };
      }>];

  const expectedCountByExamType: Record<ExamType, number> = {
    [ExamType.GONGCHAE]: gongchaeCount,
    [ExamType.GYEONGCHAE]: gyeongchaeCount,
  };

  const pendingAbsenceItems: DashboardInboxItem[] = pendingAbsenceNotes.map((note) => {
    const createdAt = note.submittedAt ?? note.createdAt;
    return {
      id: `absence-note-${note.id}`,
      type: "ABSENCE_NOTE_PENDING",
      title: `${note.student.name} · 사유서 검토 대기`,
      description: `${formatDate(note.session.examDate)} / ${EXAM_TYPE_LABEL[note.session.examType]} / ${SUBJECT_LABEL[note.session.subject]} / ${note.reason}`,
      actionUrl: `/admin/absence-notes?status=${AbsenceStatus.PENDING}`,
      actionLabel: "검토하기",
      createdAt: createdAt.toISOString(),
      createdAtLabel: formatDateTime(createdAt),
    };
  });

  const failedNotificationItems: DashboardInboxItem[] = failedNotifications.map((log) => ({
    id: `notification-log-${log.id}`,
    type: "NOTIFICATION_FAILED",
    title: `${log.student.name} · 알림 재시도 필요`,
    description: `${NOTIFICATION_TYPE_LABEL[log.type]} / ${log.failReason ?? log.message}`,
    actionUrl: "/admin/notifications",
    actionLabel: "알림 센터",
    createdAt: log.sentAt.toISOString(),
    createdAtLabel: formatDateTime(log.sentAt),
    retryPayload: {
      notificationLogId: log.id,
    },
  }));

  const missingScoreItems = todaySessions.flatMap<DashboardInboxItem>((session) => {
    const expectedCount = expectedCountByExamType[session.examType];

    if (expectedCount <= 0 || session._count.scores >= expectedCount) {
      return [];
    }

    const completionRate = Math.round((session._count.scores / expectedCount) * 1000) / 10;

    return [
      {
        id: `score-session-${session.id}`,
        type: "SCORE_MISSING",
        title: `${EXAM_TYPE_LABEL[session.examType]} ${session.week}주차 ${SUBJECT_LABEL[session.subject]} 성적 입력 대기`,
        description: `${formatDate(session.examDate)} / ${session._count.scores}/${expectedCount} 입력 / ${completionRate.toFixed(1)}% 완료`,
        actionUrl: "/admin/scores/input",
        actionLabel: "성적 입력",
        createdAt: session.examDate.toISOString(),
        createdAtLabel: formatDateTime(session.examDate),
      },
    ];
  });

  const items = [
    ...pendingAbsenceItems,
    ...failedNotificationItems,
    ...missingScoreItems.slice(0, MAX_ITEMS_PER_GROUP),
  ].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

  return {
    periodId: activePeriod.id,
    total: pendingAbsenceCount + failedNotificationCount + missingScoreItems.length,
    counts: {
      pendingAbsenceNotes: pendingAbsenceCount,
      failedNotifications: failedNotificationCount,
      missingScores: missingScoreItems.length,
    },
    items,
  };
}