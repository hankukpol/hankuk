import {
  ExamType,
  NoticeTargetType,
  NotificationType,
} from "@prisma/client";
import { toAuditJson } from "@/lib/audit";
import { sendManualNotification } from "@/lib/notifications/service";
import { sendNoticeWebPush } from "@/lib/notifications/web-push";
import { getPrisma } from "@/lib/prisma";
import { richTextToPlainText, sanitizeRichTextHtml } from "@/lib/rich-text";

export type NoticeFilters = {
  targetType?: NoticeTargetType;
  published?: boolean;
};

/**
 * Notice 모델에 isPinned 컬럼이 추가된 이후(notice_pinned.sql 마이그레이션 + prisma generate)
 * Prisma 클라이언트가 자동으로 이 타입을 갖게 됩니다.
 * 그 전까지는 런타임에 컬럼이 존재하면 값이 들어오고, 없으면 undefined 입니다.
 */
export type NoticeWithPin = {
  id: number;
  title: string;
  content: string;
  targetType: NoticeTargetType;
  isPinned: boolean;
  isPublished: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NoticeInput = {
  title: string;
  content: string;
  targetType: NoticeTargetType;
  isPinned?: boolean;
};

function noticeTargetToExamType(targetType: NoticeTargetType) {
  switch (targetType) {
    case NoticeTargetType.GONGCHAE:
      return ExamType.GONGCHAE;
    case NoticeTargetType.GYEONGCHAE:
      return ExamType.GYEONGCHAE;
    default:
      return undefined;
  }
}

function examTypeToNoticeTarget(examType: ExamType) {
  return examType === ExamType.GYEONGCHAE
    ? NoticeTargetType.GYEONGCHAE
    : NoticeTargetType.GONGCHAE;
}

function normalizeNoticeInput(input: NoticeInput) {
  const title = input.title.trim();
  const content = sanitizeRichTextHtml(input.content);

  if (!title) {
    throw new Error("\uACF5\uC9C0 \uC81C\uBAA9\uC744 \uC785\uB825\uD558\uC138\uC694.");
  }

  if (!content) {
    throw new Error("\uACF5\uC9C0 \uB0B4\uC6A9\uC744 \uC785\uB825\uD558\uC138\uC694.");
  }

  return {
    ...input,
    title,
    content,
  };
}

export async function getNotice(noticeId: number): Promise<NoticeWithPin | null> {
  const row = await getPrisma().notice.findUnique({ where: { id: noticeId } });
  if (!row) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ...row, isPinned: (row as any).isPinned ?? false } as NoticeWithPin;
}

export async function listNotices(filters: NoticeFilters = {}): Promise<NoticeWithPin[]> {
  const rows = await getPrisma().notice.findMany({
    where: {
      targetType: filters.targetType,
      isPublished:
        filters.published === undefined ? undefined : filters.published,
    },
    orderBy: [{ isPublished: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
  });
  // isPinned 컬럼이 아직 Prisma 타입에 반영되지 않았을 수 있으므로 캐스팅
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows as any[]).map((r) => ({ ...r, isPinned: r.isPinned ?? false })) as NoticeWithPin[];
}

export async function listStudentNotices(examType?: ExamType): Promise<NoticeWithPin[]> {
  const targetTypes = examType
    ? [NoticeTargetType.ALL, examTypeToNoticeTarget(examType)]
    : [NoticeTargetType.ALL];

  const rows = await getPrisma().notice.findMany({
    where: {
      isPublished: true,
      targetType: {
        in: targetTypes,
      },
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  });
  // isPinned 컬럼이 아직 Prisma 타입에 반영되지 않았을 수 있으므로 캐스팅
  // 마이그레이션 후 메모리 정렬: isPinned desc → publishedAt desc
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notices = (rows as any[]).map((r) => ({ ...r, isPinned: r.isPinned ?? false })) as NoticeWithPin[];
  return notices.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return Number(b.isPinned) - Number(a.isPinned);
    const at = (a.publishedAt ?? a.createdAt).getTime();
    const bt = (b.publishedAt ?? b.createdAt).getTime();
    return bt - at;
  });
}

export async function createNotice(input: {
  adminId: string;
  payload: NoticeInput;
  ipAddress?: string | null;
}): Promise<NoticeWithPin> {
  const payload = normalizeNoticeInput(input.payload);

  const notice = await getPrisma().$transaction(async (tx) => {
    const created = await tx.notice.create({ data: payload });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "NOTICE_CREATE",
        targetType: "Notice",
        targetId: String(created.id),
        before: toAuditJson(null),
        after: toAuditJson(created),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return created;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ...notice, isPinned: (notice as any).isPinned ?? false } as NoticeWithPin;
}

export async function updateNotice(input: {
  adminId: string;
  noticeId: number;
  payload: NoticeInput;
  ipAddress?: string | null;
}): Promise<NoticeWithPin> {
  const payload = normalizeNoticeInput(input.payload);

  const notice = await getPrisma().$transaction(async (tx) => {
    const before = await tx.notice.findUniqueOrThrow({
      where: { id: input.noticeId },
    });

    const updated = await tx.notice.update({
      where: { id: input.noticeId },
      data: payload,
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "NOTICE_UPDATE",
        targetType: "Notice",
        targetId: String(updated.id),
        before: toAuditJson(before),
        after: toAuditJson(updated),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return updated;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ...notice, isPinned: (notice as any).isPinned ?? false } as NoticeWithPin;
}

export async function deleteNotice(input: {
  adminId: string;
  noticeId: number;
  ipAddress?: string | null;
}) {
  return getPrisma().$transaction(async (tx) => {
    const before = await tx.notice.findUniqueOrThrow({
      where: {
        id: input.noticeId,
      },
    });

    await tx.notice.delete({
      where: {
        id: input.noticeId,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "NOTICE_DELETE",
        targetType: "Notice",
        targetId: String(input.noticeId),
        before: toAuditJson(before),
        after: toAuditJson(null),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      success: true,
    };
  });
}

export async function pinNotice(input: {
  adminId: string;
  noticeId: number;
  isPinned: boolean;
  ipAddress?: string | null;
}) {
  return getPrisma().$transaction(async (tx) => {
    const before = await tx.notice.findUniqueOrThrow({
      where: { id: input.noticeId },
    });

    // isPinned 컬럼은 DB 마이그레이션(notice_pinned.sql) 후 Prisma 클라이언트에 반영됩니다.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const noticeRaw = await (tx.notice.update as any)({
      where: { id: input.noticeId },
      data: { isPinned: input.isPinned },
    });
    const notice: NoticeWithPin = { ...noticeRaw, isPinned: noticeRaw.isPinned ?? input.isPinned };

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: input.isPinned ? "NOTICE_PIN" : "NOTICE_UNPIN",
        targetType: "Notice",
        targetId: String(notice.id),
        before: toAuditJson(before),
        after: toAuditJson(notice),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return { notice };
  });
}

export async function publishNotice(input: {
  adminId: string;
  noticeId: number;
  isPublished: boolean;
  sendNotification?: boolean;
  ipAddress?: string | null;
}) {
  const result = await getPrisma().$transaction(async (tx) => {
    const before = await tx.notice.findUniqueOrThrow({
      where: {
        id: input.noticeId,
      },
    });

    const notice = await tx.notice.update({
      where: {
        id: input.noticeId,
      },
      data: {
        isPublished: input.isPublished,
        publishedAt: input.isPublished ? new Date() : null,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: input.isPublished ? "NOTICE_PUBLISH" : "NOTICE_UNPUBLISH",
        targetType: "Notice",
        targetId: String(notice.id),
        before: toAuditJson(before),
        after: toAuditJson(notice),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notice: { ...notice, isPinned: (notice as any).isPinned ?? (before as any).isPinned ?? false } as NoticeWithPin,
      wasPublishedBefore: before.isPublished,
    };
  });

  let notificationError: string | null = null;
  let pushSummary:
    | {
        status: "completed" | "skipped" | "failed";
        message: string;
      }
    | null = null;

  if (input.isPublished && !result.wasPublishedBefore) {
    try {
      const pushResult = await sendNoticeWebPush(result.notice);

      pushSummary =
        pushResult.status === "completed"
          ? {
              status: "completed",
              message: `\uC804\uB2EC ${pushResult.sentCount}/${pushResult.totalSubscriptions}\uAC74, \uC2E4\uD328 ${pushResult.failedCount}\uAC74${
                pushResult.removedCount > 0
                  ? `, \uB9CC\uB8CC \uC815\uB9AC ${pushResult.removedCount}\uAC74`
                  : ""
              }`,
            }
          : {
              status: "skipped",
              message: pushResult.reason,
            };
    } catch (error) {
      console.error("[Notice] web push failed:", error);
      pushSummary = {
        status: "failed",
        message:
          error instanceof Error
            ? error.message
            : "\uD478\uC2DC \uBC1C\uC1A1 \uC911 \uC54C \uC218 \uC5C6\uB294 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.",
      };
    }
  }

  if (input.isPublished && input.sendNotification) {
    try {
      const plainTextContent = richTextToPlainText(result.notice.content);

      await sendManualNotification({
        adminId: input.adminId,
        type: NotificationType.NOTICE,
        message: `[\uACF5\uC9C0] ${result.notice.title}\n\n${plainTextContent}`,
        examType: noticeTargetToExamType(result.notice.targetType),
        ipAddress: input.ipAddress,
      });
    } catch (error) {
      notificationError =
        error instanceof Error
          ? error.message
          : "\uACF5\uC9C0 \uC54C\uB9BC \uBC1C\uC1A1\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.";
    }
  }

  return {
    notice: result.notice,
    notificationError,
    pushSummary,
  };
}
