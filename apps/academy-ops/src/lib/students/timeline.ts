import {
  AbsenceStatus,
  NotificationChannel,
  NotificationType,
  StudentStatus,
} from "@prisma/client";
import {
  STATUS_LABEL,
  POINT_TYPE_LABEL,
  formatPoint,
  formatScore,
} from "@/lib/analytics/presentation";
import {
  ABSENCE_CATEGORY_LABEL,
  ATTEND_TYPE_LABEL,
  SCORE_SOURCE_LABEL,
  getSubjectDisplayLabel,
} from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";

export const TIMELINE_EVENT_TYPES = [
  "SCORE",
  "ABSENCE_NOTE",
  "STATUS_CHANGE",
  "COUNSELING",
  "POINT",
  "NOTIFICATION",
] as const;

export type StudentTimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export type StudentTimelineEvent = {
  id: string;
  type: StudentTimelineEventType;
  title: string;
  description: string;
  detail: string | null;
  date: string;
  badge: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

export type StudentTimelineData = {
  examNumber: string;
  studentName: string;
  days: number;
  events: StudentTimelineEvent[];
};

const DEFAULT_DAYS = 90;
const MIN_DAYS = 30;
const MAX_DAYS = 365;

const ABSENCE_STATUS_LABELS: Record<AbsenceStatus, string> = {
  PENDING: "\uAC80\uD1A0 \uB300\uAE30",
  APPROVED: "\uC2B9\uC778",
  REJECTED: "\uBC18\uB824",
};

const NOTIFICATION_STATUS_LABELS: Record<string, string> = {
  pending: "\uBC1C\uC1A1 \uB300\uAE30",
  sent: "\uBC1C\uC1A1 \uC644\uB8CC",
  failed: "\uBC1C\uC1A1 \uC2E4\uD328",
  skipped: "\uAC74\uB108\uB700",
  retrying: "\uC7AC\uC2DC\uB3C4 \uC911",
  retried: "\uC7AC\uC2DC\uB3C4\uB428",
};

const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  ALIMTALK: "\uC54C\uB9BC\uD1A1",
  SMS: "SMS",
  WEB_PUSH: "\uC6F9 \uD478\uC2DC",
};

const TIMELINE_NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  WARNING_1: "1\uCC28 \uACBD\uACE0",
  WARNING_2: "2\uCC28 \uACBD\uACE0",
  DROPOUT: "\uD0C8\uB77D",
  ABSENCE_NOTE: "\uC0AC\uC720\uC11C",
  POINT: "\uD3EC\uC778\uD2B8",
  NOTICE: "\uACF5\uC9C0",
  SCORE_DEADLINE: "\uC131\uC801 \uC785\uB825 \uB9C8\uAC10",
  ENROLLMENT_COMPLETE: "\uC218\uAC15 \uB4F1\uB85D",
  PAYMENT_COMPLETE: "\uC218\uB0A9 \uC644\uB8CC",
  REFUND_COMPLETE: "\uD658\uBD88 \uC644\uB8CC",
  PAYMENT_OVERDUE: "\uBBF8\uB0A9 \uB3C5\uCD09",
};

function normalizeTimelineDays(days?: number) {
  if (!days || !Number.isFinite(days)) {
    return DEFAULT_DAYS;
  }

  return Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.floor(days)));
}

export function parseTimelineDays(value?: string | number | null) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_DAYS;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Invalid timeline days parameter.");
  }

  return normalizeTimelineDays(parsed);
}

function subtractDays(base: Date, days: number) {
  const date = new Date(base);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date;
}

function compactParts(parts: Array<string | null | undefined>) {
  return parts.filter((value): value is string => Boolean(value)).join(" \u00b7 ");
}

function truncateText(value: string | null | undefined, limit = 120) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();

  if (!normalized) {
    return null;
  }

  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}\u2026` : normalized;
}

function buildStatusDetail(input: {
  weekAbsenceCount: number;
  monthAbsenceCount: number;
  recoveryDate: Date | null;
}) {
  return compactParts([
    `\uC8FC\uAC04 \uACB0\uC2DC ${input.weekAbsenceCount}\uD68C`,
    `\uC6D4\uAC04 \uACB0\uC2DC ${input.monthAbsenceCount}\uD68C`,
    input.recoveryDate ? `\uBCF5\uAD6C \uC608\uC815 ${formatDate(input.recoveryDate)}` : null,
  ]);
}

function resolveAbsenceEventDate(note: {
  approvedAt: Date | null;
  submittedAt: Date | null;
  updatedAt: Date;
}) {
  return [note.approvedAt, note.submittedAt, note.updatedAt]
    .filter((value): value is Date => Boolean(value))
    .sort((left, right) => right.getTime() - left.getTime())[0];
}

export async function getStudentTimeline(input: {
  examNumber: string;
  days?: number;
}): Promise<StudentTimelineData | null> {
  const prisma = getPrisma();
  const days = normalizeTimelineDays(input.days);
  const cutoff = subtractDays(new Date(), days);

  const student = await prisma.student.findUnique({
    where: {
      examNumber: input.examNumber,
    },
    select: {
      examNumber: true,
      name: true,
    },
  });

  if (!student) {
    return null;
  }

  const [scores, absenceNotes, rawSnapshots, counselingRecords, pointLogs, notificationLogs] =
    await Promise.all([
      prisma.score.findMany({
        where: {
          examNumber: input.examNumber,
          session: {
            examDate: {
              gte: cutoff,
            },
          },
        },
        select: {
          id: true,
          sessionId: true,
          rawScore: true,
          oxScore: true,
          finalScore: true,
          attendType: true,
          sourceType: true,
          note: true,
          session: {
            select: {
              examDate: true,
              week: true,
              subject: true,
              displaySubjectName: true,
            },
          },
        },
        orderBy: [{ session: { examDate: "desc" } }, { id: "desc" }],
      }),
      prisma.absenceNote.findMany({
        where: {
          examNumber: input.examNumber,
          OR: [
            { submittedAt: { gte: cutoff } },
            { approvedAt: { gte: cutoff } },
            { updatedAt: { gte: cutoff } },
          ],
        },
        select: {
          id: true,
          reason: true,
          status: true,
          absenceCategory: true,
          submittedAt: true,
          approvedAt: true,
          updatedAt: true,
          session: {
            select: {
              examDate: true,
              week: true,
              subject: true,
              displaySubjectName: true,
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
      prisma.weeklyStatusSnapshot.findMany({
        where: {
          examNumber: input.examNumber,
        },
        select: {
          id: true,
          weekKey: true,
          weekStartDate: true,
          status: true,
          weekAbsenceCount: true,
          monthAbsenceCount: true,
          recoveryDate: true,
        },
        orderBy: [{ weekStartDate: "asc" }, { id: "asc" }],
      }),
      prisma.counselingRecord.findMany({
        where: {
          examNumber: input.examNumber,
          counseledAt: {
            gte: cutoff,
          },
        },
        select: {
          id: true,
          counselorName: true,
          content: true,
          recommendation: true,
          nextSchedule: true,
          counseledAt: true,
        },
        orderBy: [{ counseledAt: "desc" }, { id: "desc" }],
      }),
      prisma.pointLog.findMany({
        where: {
          examNumber: input.examNumber,
          grantedAt: {
            gte: cutoff,
          },
        },
        select: {
          id: true,
          type: true,
          amount: true,
          reason: true,
          grantedBy: true,
          grantedAt: true,
        },
        orderBy: [{ grantedAt: "desc" }, { id: "desc" }],
      }),
      prisma.notificationLog.findMany({
        where: {
          examNumber: input.examNumber,
          sentAt: {
            gte: cutoff,
          },
        },
        select: {
          id: true,
          type: true,
          channel: true,
          message: true,
          status: true,
          failReason: true,
          sentAt: true,
        },
        orderBy: [{ sentAt: "desc" }, { id: "desc" }],
      }),
    ]);

  const scoreEvents: StudentTimelineEvent[] = scores.map((score) => {
    const subjectLabel = getSubjectDisplayLabel(
      score.session.subject,
      score.session.displaySubjectName,
    );
    const scoreValue = score.finalScore ?? score.rawScore ?? score.oxScore;

    return {
      id: `score-${score.id}`,
      type: "SCORE",
      title: `${subjectLabel} \u00b7 ${score.session.week}\uC8FC\uCC28`,
      description: compactParts([
        scoreValue === null
          ? "\uBBF8\uC751\uC2DC"
          : `\uC810\uC218 ${formatScore(scoreValue)}`,
        ATTEND_TYPE_LABEL[score.attendType],
        SCORE_SOURCE_LABEL[score.sourceType],
      ]),
      detail: truncateText(score.note, 140),
      date: score.session.examDate.toISOString(),
      badge: ATTEND_TYPE_LABEL[score.attendType],
      metadata: {
        sessionId: score.sessionId,
        attendType: score.attendType,
        sourceType: score.sourceType,
      },
    } satisfies StudentTimelineEvent;
  });

  const absenceEvents: StudentTimelineEvent[] = absenceNotes.map((note) => {
      const occurredAt = resolveAbsenceEventDate(note);

      return {
        id: `absence-${note.id}`,
        type: "ABSENCE_NOTE",
        title: `${getSubjectDisplayLabel(note.session.subject, note.session.displaySubjectName)} \u00b7 ${note.session.week}\uC8FC\uCC28 \uC0AC\uC720\uC11C`,
        description: compactParts([
          ABSENCE_STATUS_LABELS[note.status],
          note.absenceCategory ? ABSENCE_CATEGORY_LABEL[note.absenceCategory] : null,
          `\uC2DC\uD5D8\uC77C ${formatDate(note.session.examDate)}`,
        ]),
        detail: truncateText(note.reason, 160),
        date: occurredAt.toISOString(),
        badge: ABSENCE_STATUS_LABELS[note.status],
        metadata: {
          status: note.status,
          category: note.absenceCategory,
        },
      } satisfies StudentTimelineEvent;
    });

  const statusEvents: StudentTimelineEvent[] = [];
  let previousStatus: StudentStatus = StudentStatus.NORMAL;

  for (const snapshot of rawSnapshots) {
    if (snapshot.status !== previousStatus) {
      if (snapshot.weekStartDate.getTime() >= cutoff.getTime()) {
        statusEvents.push({
          id: `status-${snapshot.id}`,
          type: "STATUS_CHANGE",
          title: "\uCD9C\uACB0 \uC0C1\uD0DC \uBCC0\uACBD",
          description: `${STATUS_LABEL[previousStatus]} \u2192 ${STATUS_LABEL[snapshot.status]} \u00b7 ${snapshot.weekKey}`,
          detail: buildStatusDetail({
            weekAbsenceCount: snapshot.weekAbsenceCount,
            monthAbsenceCount: snapshot.monthAbsenceCount,
            recoveryDate: snapshot.recoveryDate,
          }),
          date: snapshot.weekStartDate.toISOString(),
          badge: STATUS_LABEL[snapshot.status],
          metadata: {
            previousStatus,
            status: snapshot.status,
            weekKey: snapshot.weekKey,
          },
        });
      }
    }

    previousStatus = snapshot.status;
  }

  const counselingEvents: StudentTimelineEvent[] = counselingRecords.map((record) => ({
    id: `counseling-${record.id}`,
    type: "COUNSELING",
    title: `${record.counselorName} \uBA74\uB2F4`,
    description: truncateText(record.content, 120) ?? "-",
    detail: compactParts([
      record.recommendation
        ? `\uAD8C\uC7A5: ${truncateText(record.recommendation, 80)}`
        : null,
      record.nextSchedule
        ? `\uB2E4\uC74C \uC608\uC815 ${formatDateTime(record.nextSchedule)}`
        : null,
    ]),
    date: record.counseledAt.toISOString(),
    badge: null,
    metadata: {
      counselorName: record.counselorName,
      nextSchedule: record.nextSchedule ? record.nextSchedule.toISOString() : null,
    },
  }));

  const pointEvents: StudentTimelineEvent[] = pointLogs.map((log) => ({
    id: `point-${log.id}`,
    type: "POINT",
    title: `${POINT_TYPE_LABEL[log.type]} ${formatPoint(log.amount)}`,
    description: truncateText(log.reason, 140) ?? "-",
    detail: log.grantedBy ? `\uC9C0\uAE09: ${log.grantedBy}` : null,
    date: log.grantedAt.toISOString(),
    badge: formatPoint(log.amount),
    metadata: {
      pointType: log.type,
      amount: log.amount,
      grantedBy: log.grantedBy,
    },
  }));

  const notificationEvents: StudentTimelineEvent[] = notificationLogs.map((log) => {
    const statusLabel = NOTIFICATION_STATUS_LABELS[log.status] ?? log.status;

    return {
      id: `notification-${log.id}`,
      type: "NOTIFICATION",
      title: `${TIMELINE_NOTIFICATION_TYPE_LABELS[log.type]} \u00b7 ${statusLabel}`,
      description: truncateText(log.message, 140) ?? "-",
      detail: compactParts([
        NOTIFICATION_CHANNEL_LABELS[log.channel],
        log.failReason ? truncateText(log.failReason, 100) : null,
      ]),
      date: log.sentAt.toISOString(),
      badge: statusLabel,
      metadata: {
        notificationType: log.type,
        channel: log.channel,
        status: log.status,
      },
    } satisfies StudentTimelineEvent;
  });

  const events = [
    ...scoreEvents,
    ...absenceEvents,
    ...statusEvents,
    ...counselingEvents,
    ...pointEvents,
    ...notificationEvents,
  ].sort(
    (left, right) =>
      new Date(right.date).getTime() - new Date(left.date).getTime() ||
      left.id.localeCompare(right.id),
  );

  return {
    examNumber: student.examNumber,
    studentName: student.name,
    days,
    events,
  };
}
