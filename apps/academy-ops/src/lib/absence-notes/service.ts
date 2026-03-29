import {
  AbsenceCategory,
  AbsenceStatus,
  AttendType,
  ExamType,
  ScoreSource,
} from "@prisma/client";
import { toAuditJson } from "@/lib/audit";
import { applyAcademyScope, getAdminAcademyScope, requireVisibleAcademyId, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { recalculateStatusCache } from "@/lib/analytics/service";
import {
  buildAbsenceNoteSystemNote,
  getAbsenceNoteSystemNoteId,
  stripAbsenceNoteSystemNote,
} from "@/lib/absence-notes/system-note";
import { triggerAbsenceNoteNotification } from "@/lib/notifications/auto-trigger";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { getPrisma } from "@/lib/prisma";
import {
  ABSENCE_ATTACHMENT_BUCKET,
  createAdminClient,
} from "@/lib/supabase/admin";

export type AbsenceNoteFilters = {
  periodId?: number;
  examType?: ExamType;
  status?: AbsenceStatus;
  absenceCategory?: AbsenceCategory;
  search?: string;
  submittedFrom?: string; // YYYY-MM-DD
  submittedTo?: string;   // YYYY-MM-DD
};

export type AbsenceNoteFormInput = {
  examNumber: string;
  sessionId: number;
  reason: string;
  absenceCategory: AbsenceCategory;
  attendCountsAsAttendance?: boolean;
  attendGrantsPerfectAttendance?: boolean;
  adminNote?: string | null;
};

type AbsenceAttendanceOptions = Pick<
  AbsenceNoteFormInput,
  "attendCountsAsAttendance" | "attendGrantsPerfectAttendance"
>;

type AbsenceNoteAttachmentUploadInput = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  buffer: Buffer;
};

type AbsenceNoteAttachmentRecord = {
  id: number;
  noteId: number;
  bucket: string;
  storagePath: string;
  originalFileName: string;
  contentType: string;
  byteSize: number;
  uploadedByAdminId: string | null;
  createdAt: Date;
};

const ABSENCE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const ABSENCE_ATTACHMENT_ALLOWED_TYPES = new Map<string, string[]>([
  ["application/pdf", [".pdf"]],
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/png", [".png"]],
]);

export const ABSENCE_ATTACHMENT_EMPTY_MESSAGE = "첨부 파일을 선택해 주세요.";
export const ABSENCE_ATTACHMENT_LOCKED_MESSAGE = "승인 완료된 사유서는 첨부를 수정할 수 없습니다.";
const ABSENCE_ATTACHMENT_NOTE_NOT_FOUND_MESSAGE = "사유서를 찾을 수 없습니다.";
const ABSENCE_ATTACHMENT_NOT_FOUND_MESSAGE = "첨부 파일을 찾을 수 없습니다.";
const ABSENCE_ATTACHMENT_UPLOAD_FAILED_MESSAGE = "첨부 업로드에 실패했습니다.";
const ABSENCE_ATTACHMENT_DOWNLOAD_FAILED_MESSAGE = "첨부 다운로드 링크 생성에 실패했습니다.";
const ABSENCE_ATTACHMENT_STORAGE_CLEANUP_FAILED_MESSAGE = "첨부 파일 정리에 실패했습니다.";

async function resolveAbsenceNoteAcademyId() {
  const scope = await getAdminAcademyScope();
  return resolveVisibleAcademyId(scope);
}

async function requireAbsenceWriteAcademyId() {
  const scope = await getAdminAcademyScope();
  return requireVisibleAcademyId(scope);
}

export async function getAbsenceNoteDetail(noteId: number) {
  const academyId = await resolveAbsenceNoteAcademyId();
  const note = await getPrisma().absenceNote.findFirst({
    where: applyAcademyScope({ id: noteId }, academyId),
    include: {
      student: {
        select: {
          examNumber: true,
          name: true,
          phone: true,
        },
      },
      session: {
        include: {
          period: {
            select: { id: true, name: true },
          },
        },
      },
      attachments: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!note) {
    throw new Error("사유서를 찾을 수 없습니다.");
  }

  return note;
}

function resolveAbsenceAttendanceOptions(
  absenceCategory: AbsenceCategory,
  input: AbsenceAttendanceOptions,
) {
  if (absenceCategory === AbsenceCategory.MILITARY) {
    return {
      attendCountsAsAttendance: true,
      attendGrantsPerfectAttendance: true,
    };
  }

  const attendGrantsPerfectAttendance = Boolean(input.attendGrantsPerfectAttendance);
  const attendCountsAsAttendance = Boolean(
    input.attendCountsAsAttendance || attendGrantsPerfectAttendance,
  );

  return {
    attendCountsAsAttendance,
    attendGrantsPerfectAttendance,
  };
}

function startOfToday() {
  return new Date(new Date().setHours(0, 0, 0, 0));
}

function normalizeAbsenceAttachmentInput(input: Omit<AbsenceNoteAttachmentUploadInput, "buffer">) {
  const fileName = input.fileName.trim();
  const contentType = input.contentType.trim().toLowerCase();
  const extension = extname(fileName).toLowerCase();
  const allowedExtensions = ABSENCE_ATTACHMENT_ALLOWED_TYPES.get(contentType);

  if (!fileName) {
    throw new Error("첨부 파일 이름이 올바르지 않습니다.");
  }

  if (!allowedExtensions || !extension || !allowedExtensions.includes(extension)) {
    throw new Error("PDF, JPG, JPEG, PNG 파일만 첨부할 수 있습니다.");
  }

  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new Error("비어 있는 파일은 업로드할 수 없습니다.");
  }

  if (input.sizeBytes > ABSENCE_ATTACHMENT_MAX_BYTES) {
    throw new Error("첨부 파일은 5MB 이하만 업로드할 수 있습니다.");
  }

  return {
    fileName,
    contentType,
    sizeBytes: input.sizeBytes,
    extension,
  };
}

function buildAbsenceAttachmentStoragePath(noteId: number, extension: string) {
  return `absence-notes/${noteId}/${randomUUID()}${extension}`;
}

async function removeAbsenceAttachmentObjects(storagePaths: string[]) {
  if (storagePaths.length === 0) {
    return;
  }

  const { error } = await createAdminClient()
    .storage
    .from(ABSENCE_ATTACHMENT_BUCKET)
    .remove(storagePaths);

  if (error) {
    throw new Error(error.message);
  }
}

async function findAbsenceNoteAttachmentOrThrow(
  noteId: number,
  attachmentId: number,
  academyId: number | null,
) {
  const attachment = await getPrisma().absenceNoteAttachment.findFirst({
    where: {
      id: attachmentId,
      noteId,
      ...(academyId === null ? {} : { note: { academyId } }),
    },
    include: {
      note: {
        select: { academyId: true },
      },
    },
  });

  if (!attachment) {
    throw new Error(ABSENCE_ATTACHMENT_NOT_FOUND_MESSAGE);
  }

  return attachment;
}
function validateAbsenceNoteInput(input: AbsenceNoteFormInput) {
  const examNumber = input.examNumber.trim();
  const reason = input.reason.trim();

  if (!examNumber) {
    throw new Error("수험번호를 입력해 주세요.");
  }

  if (!Number.isInteger(input.sessionId) || input.sessionId <= 0) {
    throw new Error("유효한 회차를 선택해 주세요.");
  }

  if (!reason) {
    throw new Error("사유 내용을 입력해 주세요.");
  }

  return {
    ...input,
    examNumber,
    reason,
    adminNote: input.adminNote?.trim() || null,
  };
}

async function applyApprovedAbsenceNote(
  tx: Parameters<Parameters<ReturnType<typeof getPrisma>["$transaction"]>[0]>[0],
  note: {
    id: number;
    academyId?: number | null;
    examNumber: string;
    sessionId: number;
    reason: string;
  },
) {
  const score = await tx.score.findUnique({
    where: {
      examNumber_sessionId: {
        examNumber: note.examNumber,
        sessionId: note.sessionId,
      },
    },
  });

  if (
    score &&
    (score.attendType === AttendType.NORMAL || score.attendType === AttendType.LIVE)
  ) {
    throw new Error("이미 정상 출결이나 실시간 출석으로 기록된 회차는 사유서 승인으로 바꿀 수 없습니다.");
  }

  const systemNote = buildAbsenceNoteSystemNote(note.id, note.reason);

  if (!score) {
    await tx.score.create({
      data: {
        academyId: note.academyId ?? null,
        examNumber: note.examNumber,
        sessionId: note.sessionId,
        rawScore: null,
        oxScore: null,
        finalScore: null,
        attendType: AttendType.EXCUSED,
        sourceType: ScoreSource.MANUAL_INPUT,
        note: systemNote,
      },
    });
    return;
  }

  await tx.score.update({
    where: {
      id: score.id,
    },
    data: {
      attendType: AttendType.EXCUSED,
      note: systemNote,
    },
  });
}

async function revertApprovedAbsenceNote(
  tx: Parameters<Parameters<ReturnType<typeof getPrisma>["$transaction"]>[0]>[0],
  note: {
    id: number;
    examNumber: string;
    sessionId: number;
  },
) {
  const score = await tx.score.findUnique({
    where: {
      examNumber_sessionId: {
        examNumber: note.examNumber,
        sessionId: note.sessionId,
      },
    },
  });

  if (!score) {
    return;
  }

  const generatedByAbsenceNote = getAbsenceNoteSystemNoteId(score.note) === note.id;

  if (!generatedByAbsenceNote && score.attendType !== AttendType.EXCUSED) {
    return;
  }

  if (
    generatedByAbsenceNote &&
    score.sourceType === ScoreSource.MANUAL_INPUT &&
    score.rawScore === null &&
    score.oxScore === null &&
    score.finalScore === null
  ) {
    await tx.score.delete({
      where: {
        id: score.id,
      },
    });
    return;
  }

  await tx.score.update({
    where: {
      id: score.id,
    },
    data: {
      attendType: AttendType.ABSENT,
      note: stripAbsenceNoteSystemNote(score.note, note.id),
    },
  });
}

export async function revertAbsenceNote(input: {
  adminId: string;
  noteId: number;
  ipAddress?: string | null;
}) {
  const academyId = await requireAbsenceWriteAcademyId();

  return getPrisma().$transaction(async (tx) => {
    const note = await tx.absenceNote.findFirstOrThrow({
      where: { id: input.noteId, academyId },
      include: { session: true },
    });

    if (note.status !== "APPROVED") {
      throw new Error("승인된 사유서만 승인 취소할 수 있습니다.");
    }

    await revertApprovedAbsenceNote(tx, note);

    const updated = await tx.absenceNote.update({
      where: { id: input.noteId },
      data: { status: "PENDING", adminNote: null },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "ABSENCE_NOTE_REVERT",
        targetType: "AbsenceNote",
        targetId: String(input.noteId),
        before: toAuditJson(note),
        after: toAuditJson(updated),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return updated;
  });
}

export async function listAbsenceNotes(filters: AbsenceNoteFilters) {
  const academyId = await resolveAbsenceNoteAcademyId();
  const search = filters.search?.trim();

  const submittedFrom = filters.submittedFrom
    ? new Date(filters.submittedFrom + "T00:00:00")
    : undefined;
  const submittedTo = filters.submittedTo
    ? new Date(filters.submittedTo + "T23:59:59")
    : undefined;

  return getPrisma().absenceNote.findMany({
    where: applyAcademyScope({
      status: filters.status,
      absenceCategory: filters.absenceCategory,
      session: {
        periodId: filters.periodId,
        examType: filters.examType,
      },
      submittedAt:
        submittedFrom || submittedTo
          ? { gte: submittedFrom, lte: submittedTo }
          : undefined,
      OR: search
        ? [
            { examNumber: { contains: search } },
            { student: { name: { contains: search } } },
          ]
        : undefined,
    }, academyId),
    include: {
      attachments: {
        orderBy: { createdAt: "desc" },
      },
      student: {
        select: {
          name: true,
          examType: true,
          currentStatus: true,
        },
      },
      session: {
        include: {
          period: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { session: { examDate: "desc" } }, { examNumber: "asc" }],
  });
}

export async function getAbsenceNoteDashboard(periodId: number, examType: ExamType) {
  const academyId = await resolveAbsenceNoteAcademyId();
  const today = startOfToday();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const sessionFilter = applyAcademyScope({ session: { periodId, examType } }, academyId);

  const [pending, approvedToday, rejected, approvedTotal, categoryGroups] = await Promise.all([
    getPrisma().absenceNote.count({ where: { status: AbsenceStatus.PENDING, ...sessionFilter } }),
    getPrisma().absenceNote.count({
      where: {
        status: AbsenceStatus.APPROVED,
        approvedAt: { gte: today, lt: tomorrow },
        ...sessionFilter,
      },
    }),
    getPrisma().absenceNote.count({ where: { status: AbsenceStatus.REJECTED, ...sessionFilter } }),
    getPrisma().absenceNote.count({ where: { status: AbsenceStatus.APPROVED, ...sessionFilter } }),
    getPrisma().absenceNote.groupBy({
      by: ["absenceCategory"],
      where: { ...sessionFilter },
      _count: { id: true },
    }),
  ]);

  const categoryBreakdown = Object.fromEntries(
    categoryGroups.map((g) => [g.absenceCategory ?? "OTHER", g._count.id]),
  ) as Partial<Record<AbsenceCategory, number>>;

  return {
    pending,
    approvedToday,
    rejected,
    approved: approvedTotal,
    total: pending + approvedTotal + rejected,
    categoryBreakdown,
  };
}

export async function createAbsenceNote(input: {
  adminId: string;
  payload: AbsenceNoteFormInput;
  ipAddress?: string | null;
}) {
  const academyId = await requireAbsenceWriteAcademyId();
  const payload = validateAbsenceNoteInput(input.payload);
  const result = await getPrisma().$transaction(async (tx) => {
    await tx.student.findFirstOrThrow({
      where: { examNumber: payload.examNumber, academyId },
      select: { examNumber: true },
    });

    const session = await tx.examSession.findFirstOrThrow({
      where: { id: payload.sessionId, period: { academyId } },
      include: { period: true },
    });

    if (session.period.academyId !== academyId) {
      throw new Error("해당 지점의 회차를 찾을 수 없습니다.");
    }

    const autoApprove = payload.absenceCategory === AbsenceCategory.MILITARY;
    const attendanceOptions = resolveAbsenceAttendanceOptions(payload.absenceCategory, payload);
    const note = await tx.absenceNote.create({
      data: {
        academyId,
        examNumber: payload.examNumber,
        sessionId: payload.sessionId,
        reason: payload.reason,
        absenceCategory: payload.absenceCategory,
        status: autoApprove ? AbsenceStatus.APPROVED : AbsenceStatus.PENDING,
        submittedAt: new Date(),
        approvedAt: autoApprove ? new Date() : null,
        ...attendanceOptions,
        adminNote: payload.adminNote,
      },
    });

    if (autoApprove) {
      await applyApprovedAbsenceNote(tx, note);
    }

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: autoApprove ? "ABSENCE_NOTE_CREATE_AUTO_APPROVE" : "ABSENCE_NOTE_CREATE",
        targetType: "AbsenceNote",
        targetId: String(note.id),
        before: toAuditJson(null),
        after: toAuditJson(note),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      note,
      session,
      autoApprove,
    };
  });

  if (result.autoApprove) {
    await recalculateStatusCache(result.session.periodId, result.session.examType, {
      examNumbers: [result.note.examNumber],
    });
  }

  return result.note;
}

export async function updateAbsenceNote(input: {
  adminId: string;
  noteId: number;
  payload: Pick<AbsenceNoteFormInput, "reason" | "absenceCategory" | "attendCountsAsAttendance" | "attendGrantsPerfectAttendance" | "adminNote">;
  ipAddress?: string | null;
}) {
  const academyId = await requireAbsenceWriteAcademyId();
  const reason = input.payload.reason.trim();

  if (!reason) {
    throw new Error("사유 내용을 입력해 주세요.");
  }

  const result = await getPrisma().$transaction(async (tx) => {
    const before = await tx.absenceNote.findFirstOrThrow({
      where: {
        id: input.noteId,
        academyId,
      },
      include: {
        session: true,
      },
    });

    if (before.status === AbsenceStatus.APPROVED) {
      throw new Error("승인된 사유서는 내용을 수정할 수 없습니다. 승인 취소 후 다시 시도해 주세요.");
    }

    const autoApprove = input.payload.absenceCategory === AbsenceCategory.MILITARY;
    const attendanceOptions = resolveAbsenceAttendanceOptions(
      input.payload.absenceCategory,
      input.payload,
    );
    const note = await tx.absenceNote.update({
      where: {
        id: input.noteId,
      },
      data: {
        reason,
        absenceCategory: input.payload.absenceCategory,
        adminNote: input.payload.adminNote?.trim() || null,
        status: autoApprove ? AbsenceStatus.APPROVED : before.status,
        approvedAt: autoApprove ? new Date() : before.approvedAt,
        ...attendanceOptions,
      },
    });

    if (autoApprove) {
      await applyApprovedAbsenceNote(tx, note);
    }

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: autoApprove ? "ABSENCE_NOTE_UPDATE_AUTO_APPROVE" : "ABSENCE_NOTE_UPDATE",
        targetType: "AbsenceNote",
        targetId: String(note.id),
        before: toAuditJson(before),
        after: toAuditJson(note),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      note,
      session: before.session,
      autoApprove,
    };
  });

  if (result.autoApprove) {
    await recalculateStatusCache(result.session.periodId, result.session.examType, {
      examNumbers: [result.note.examNumber],
    });
  }

  return result.note;
}

export async function reviewAbsenceNote(input: {
  adminId: string;
  noteId: number;
  action: "approve" | "reject";
  attendCountsAsAttendance?: boolean;
  attendGrantsPerfectAttendance?: boolean;
  adminNote?: string | null;
  ipAddress?: string | null;
}) {
  const academyId = await requireAbsenceWriteAcademyId();
  const result = await getPrisma().$transaction(async (tx) => {
    const before = await tx.absenceNote.findFirstOrThrow({
      where: {
        id: input.noteId,
        academyId,
      },
      include: {
        session: true,
      },
    });

    if (input.action === "approve") {
      const attendanceOptions = resolveAbsenceAttendanceOptions(
        before.absenceCategory ?? AbsenceCategory.OTHER,
        {
          attendCountsAsAttendance: input.attendCountsAsAttendance ?? before.attendCountsAsAttendance,
          attendGrantsPerfectAttendance:
            input.attendGrantsPerfectAttendance ?? before.attendGrantsPerfectAttendance,
        },
      );
      const note = await tx.absenceNote.update({
        where: {
          id: input.noteId,
        },
        data: {
          status: AbsenceStatus.APPROVED,
          approvedAt: new Date(),
          ...attendanceOptions,
          adminNote: input.adminNote?.trim() || null,
        },
      });

      await applyApprovedAbsenceNote(tx, note);

      await tx.auditLog.create({
        data: {
          adminId: input.adminId,
          action: "ABSENCE_NOTE_APPROVE",
          targetType: "AbsenceNote",
          targetId: String(note.id),
          before: toAuditJson(before),
          after: toAuditJson(note),
          ipAddress: input.ipAddress ?? null,
        },
      });

      return {
        note,
        session: before.session,
        shouldRecalculate: true,
        previousStatus: before.status,
      };
    }

    const note = await tx.absenceNote.update({
      where: {
        id: input.noteId,
      },
      data: {
        status: AbsenceStatus.REJECTED,
        approvedAt: null,
        adminNote: input.adminNote?.trim() || null,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "ABSENCE_NOTE_REJECT",
        targetType: "AbsenceNote",
        targetId: String(note.id),
        before: toAuditJson(before),
        after: toAuditJson(note),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      note,
      session: before.session,
      shouldRecalculate: false,
      previousStatus: before.status,
    };
  });

  if (result.shouldRecalculate) {
    await recalculateStatusCache(result.session.periodId, result.session.examType, {
      examNumbers: [result.note.examNumber],
    });
  }

  if (result.previousStatus !== result.note.status) {
    void triggerAbsenceNoteNotification({
      noteId: result.note.id,
      status: result.note.status,
    }).catch((error: unknown) => {
      console.error("[AbsenceNote] auto notification failed:", error);
    });
  }

  return result.note;
}

export async function changeAbsenceNoteSession(input: {
  adminId: string;
  noteId: number;
  newSessionId: number;
  ipAddress?: string | null;
}) {
  const academyId = await requireAbsenceWriteAcademyId();
  const result = await getPrisma().$transaction(async (tx) => {
    const before = await tx.absenceNote.findFirstOrThrow({
      where: { id: input.noteId, academyId },
      include: { session: true },
    });

    if (before.sessionId === input.newSessionId) {
      throw new Error("같은 회차로는 변경할 수 없습니다.");
    }

    await tx.examSession.findFirstOrThrow({
      where: { id: input.newSessionId, period: { academyId } },
    });

    const conflict = await tx.absenceNote.findFirst({
      where: {
        academyId,
        examNumber: before.examNumber,
        sessionId: input.newSessionId,
      },
    });
    if (conflict) {
      throw new Error("이미 같은 학생의 사유서가 있는 회차로는 변경할 수 없습니다.");
    }

    const wasApproved = before.status === AbsenceStatus.APPROVED;
    if (wasApproved) {
      await revertApprovedAbsenceNote(tx, before);
    }

    const updated = await tx.absenceNote.update({
      where: { id: input.noteId },
      data: {
        sessionId: input.newSessionId,
        status: wasApproved ? AbsenceStatus.PENDING : before.status,
        approvedAt: wasApproved ? null : before.approvedAt,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "ABSENCE_NOTE_SESSION_CHANGE",
        targetType: "AbsenceNote",
        targetId: String(input.noteId),
        before: toAuditJson(before),
        after: toAuditJson(updated),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return { updated, oldSession: before.session, wasApproved };
  });

  if (result.wasApproved) {
    await recalculateStatusCache(result.oldSession.periodId, result.oldSession.examType, {
      examNumbers: [result.updated.examNumber],
    });
  }

  return result.updated;
}

export type BulkCreateAbsenceNotesResult = {
  succeeded: number;
  skipped: number;
  autoApproved: number;
  errors: { sessionId: number; message: string }[];
};

export async function bulkCreateAbsenceNotes(input: {
  adminId: string;
  payload: {
    examNumber: string;
    sessionIds: number[];
    reason: string;
    absenceCategory: AbsenceCategory;
    attendCountsAsAttendance?: boolean;
    attendGrantsPerfectAttendance?: boolean;
    adminNote?: string | null;
  };
  ipAddress?: string | null;
}): Promise<BulkCreateAbsenceNotesResult> {
  const academyId = await requireAbsenceWriteAcademyId();
  const { payload } = input;
  const examNumber = payload.examNumber.trim();
  const reason = payload.reason.trim();

  if (!examNumber) throw new Error("수험번호를 입력해 주세요.");
  if (!reason) throw new Error("사유 내용을 입력해 주세요.");
  if (!payload.sessionIds.length) throw new Error("회차를 하나 이상 선택해 주세요.");

  const autoApprove = payload.absenceCategory === AbsenceCategory.MILITARY;

  type SingleResult =
    | { type: "created"; periodId: number; examType: ExamType; autoApprove: boolean }
    | { type: "skipped" };

  const results = await Promise.allSettled<SingleResult>(
    payload.sessionIds.map(async (sessionId) => {
      return getPrisma().$transaction(async (tx) => {
        const existing = await tx.absenceNote.findFirst({
          where: { academyId, examNumber, sessionId },
        });
        if (existing) return { type: "skipped" as const };

        await tx.student.findFirstOrThrow({
          where: { examNumber, academyId },
          select: { examNumber: true },
        });

        const session = await tx.examSession.findFirstOrThrow({
          where: { id: sessionId, period: { academyId } },
        });

        const attendanceOptions = resolveAbsenceAttendanceOptions(payload.absenceCategory, payload);
        const note = await tx.absenceNote.create({
          data: {
            academyId,
            examNumber,
            sessionId,
            reason,
            absenceCategory: payload.absenceCategory,
            status: autoApprove ? AbsenceStatus.APPROVED : AbsenceStatus.PENDING,
            submittedAt: new Date(),
            approvedAt: autoApprove ? new Date() : null,
            ...attendanceOptions,
            adminNote: payload.adminNote?.trim() || null,
          },
        });

        if (autoApprove) {
          await applyApprovedAbsenceNote(tx, note);
        }

        await tx.auditLog.create({
          data: {
            adminId: input.adminId,
            action: autoApprove ? "ABSENCE_NOTE_CREATE_AUTO_APPROVE" : "ABSENCE_NOTE_CREATE",
            targetType: "AbsenceNote",
            targetId: String(note.id),
            before: toAuditJson(null),
            after: toAuditJson(note),
            ipAddress: input.ipAddress ?? null,
          },
        });

        return { type: "created" as const, periodId: session.periodId, examType: session.examType, autoApprove };
      });
    }),
  );

  const createdResults = results
    .filter((r): r is PromiseFulfilledResult<{ type: "created"; periodId: number; examType: ExamType; autoApprove: boolean }> =>
      r.status === "fulfilled" && r.value.type === "created",
    )
    .map((r) => r.value);

  const autoApprovedResults = createdResults.filter((r) => r.autoApprove);
  if (autoApprovedResults.length > 0) {
    const uniqueRecalculationTargets = Array.from(
      new Map(
        autoApprovedResults.map((result) => [
          `${result.periodId}:${result.examType}`,
          { periodId: result.periodId, examType: result.examType },
        ]),
      ).values(),
    );

    await Promise.all(
      uniqueRecalculationTargets.map((target) =>
        recalculateStatusCache(target.periodId, target.examType, {
          examNumbers: [examNumber],
        }),
      ),
    );
  }

  return {
    succeeded: createdResults.length,
    skipped: results.filter((r) => r.status === "fulfilled" && r.value.type === "skipped").length,
    autoApproved: autoApprovedResults.length,
    errors: results
      .map((r, i) => ({ r, sessionId: payload.sessionIds[i] }))
      .filter(({ r }) => r.status === "rejected")
      .map(({ r, sessionId }) => ({
        sessionId,
        message: (r as PromiseRejectedResult).reason?.message ?? "알 수 없는 오류",
      })),
  };
}

export async function uploadAbsenceNoteAttachments(input: {
  adminId: string;
  noteId: number;
  files: AbsenceNoteAttachmentUploadInput[];
  ipAddress?: string | null;
}) {
  const academyId = await requireAbsenceWriteAcademyId();

  if (input.files.length === 0) {
    throw new Error(ABSENCE_ATTACHMENT_EMPTY_MESSAGE);
  }

  const note = await getPrisma().absenceNote.findFirst({
    where: { id: input.noteId, academyId },
    select: { id: true, status: true },
  });

  if (!note) {
    throw new Error(ABSENCE_ATTACHMENT_NOTE_NOT_FOUND_MESSAGE);
  }

  if (note.status === AbsenceStatus.APPROVED) {
    throw new Error(ABSENCE_ATTACHMENT_LOCKED_MESSAGE);
  }

  const uploaded: AbsenceNoteAttachmentRecord[] = [];
  const failed: Array<{ fileName: string; message: string }> = [];

  for (const file of input.files) {
    try {
      const normalized = normalizeAbsenceAttachmentInput(file);
      const attachment = await getPrisma().absenceNoteAttachment.create({
        data: {
          noteId: input.noteId,
          bucket: ABSENCE_ATTACHMENT_BUCKET,
          storagePath: buildAbsenceAttachmentStoragePath(input.noteId, normalized.extension),
          originalFileName: normalized.fileName,
          contentType: normalized.contentType,
          byteSize: normalized.sizeBytes,
          uploadedByAdminId: input.adminId,
        },
      });

      try {
        const { error } = await createAdminClient()
          .storage
          .from(ABSENCE_ATTACHMENT_BUCKET)
          .upload(attachment.storagePath, file.buffer, {
            contentType: attachment.contentType,
            upsert: false,
          });

        if (error) {
          throw new Error(error.message);
        }
      } catch (error) {
        await getPrisma().absenceNoteAttachment.delete({
          where: { id: attachment.id },
        }).catch(() => undefined);
        throw error;
      }

      await getPrisma().auditLog.create({
        data: {
          adminId: input.adminId,
          action: "ABSENCE_NOTE_ATTACHMENT_UPLOAD",
          targetType: "AbsenceNoteAttachment",
          targetId: String(attachment.id),
          before: toAuditJson(null),
          after: toAuditJson(attachment),
          ipAddress: input.ipAddress ?? null,
        },
      });

      uploaded.push(attachment);
    } catch (error) {
      failed.push({
        fileName: file.fileName,
        message: error instanceof Error ? error.message : ABSENCE_ATTACHMENT_UPLOAD_FAILED_MESSAGE,
      });
    }
  }

  if (uploaded.length === 0 && failed.length > 0) {
    throw new Error(failed[0].message);
  }

  return { uploaded, failed };
}

export async function deleteAbsenceNoteAttachment(input: {
  adminId: string;
  noteId: number;
  attachmentId: number;
  ipAddress?: string | null;
}) {
  const academyId = await requireAbsenceWriteAcademyId();
  const note = await getPrisma().absenceNote.findFirst({
    where: { id: input.noteId, academyId },
    select: { id: true, status: true },
  });

  if (!note) {
    throw new Error(ABSENCE_ATTACHMENT_NOTE_NOT_FOUND_MESSAGE);
  }

  if (note.status === AbsenceStatus.APPROVED) {
    throw new Error(ABSENCE_ATTACHMENT_LOCKED_MESSAGE);
  }

  const attachment = await findAbsenceNoteAttachmentOrThrow(input.noteId, input.attachmentId, academyId);

  try {
    await removeAbsenceAttachmentObjects([attachment.storagePath]);
  } catch (error) {
    const storageCleanupError =
      error instanceof Error ? error.message : ABSENCE_ATTACHMENT_STORAGE_CLEANUP_FAILED_MESSAGE;

    await getPrisma().auditLog.create({
      data: {
        adminId: input.adminId,
        action: "ABSENCE_NOTE_ATTACHMENT_STORAGE_CLEANUP_FAILED",
        targetType: "AbsenceNoteAttachment",
        targetId: String(attachment.id),
        before: toAuditJson(attachment),
        after: toAuditJson({ error: storageCleanupError }),
        ipAddress: input.ipAddress ?? null,
      },
    });

    throw new Error(storageCleanupError);
  }

  await getPrisma().$transaction(async (tx) => {
    await tx.absenceNoteAttachment.delete({
      where: { id: attachment.id },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "ABSENCE_NOTE_ATTACHMENT_DELETE",
        targetType: "AbsenceNoteAttachment",
        targetId: String(attachment.id),
        before: toAuditJson(attachment),
        after: toAuditJson(null),
        ipAddress: input.ipAddress ?? null,
      },
    });
  });

  return {
    success: true,
    storageCleanupError: null,
  };
}

export async function getAbsenceNoteAttachmentDownloadUrl(input: {
  adminId: string;
  noteId: number;
  attachmentId: number;
  ipAddress?: string | null;
}) {
  const academyId = await resolveAbsenceNoteAcademyId();
  const attachment = await findAbsenceNoteAttachmentOrThrow(input.noteId, input.attachmentId, academyId);
  const { data, error } = await createAdminClient()
    .storage
    .from(attachment.bucket)
    .createSignedUrl(attachment.storagePath, 60, {
      download: attachment.originalFileName,
    });

  if (error || !data.signedUrl) {
    throw new Error(error?.message ?? ABSENCE_ATTACHMENT_DOWNLOAD_FAILED_MESSAGE);
  }

  await getPrisma().auditLog.create({
    data: {
      adminId: input.adminId,
      action: "ABSENCE_NOTE_ATTACHMENT_DOWNLOAD",
      targetType: "AbsenceNoteAttachment",
      targetId: String(attachment.id),
      before: toAuditJson(null),
      after: toAuditJson({ noteId: input.noteId }),
      ipAddress: input.ipAddress ?? null,
    },
  });

  return {
    url: data.signedUrl,
  };
}

export async function deleteAbsenceNote(input: {
  adminId: string;
  noteId: number;
  ipAddress?: string | null;
}) {
  const academyId = await requireAbsenceWriteAcademyId();
  const note = await getPrisma().absenceNote.findFirstOrThrow({
    where: {
      id: input.noteId,
      academyId,
    },
    include: {
      attachments: true,
      session: true,
    },
  });

  try {
    await removeAbsenceAttachmentObjects(note.attachments.map((attachment) => attachment.storagePath));
  } catch (error) {
    const storageCleanupError =
      error instanceof Error ? error.message : ABSENCE_ATTACHMENT_STORAGE_CLEANUP_FAILED_MESSAGE;

    await getPrisma().auditLog.create({
      data: {
        adminId: input.adminId,
        action: "ABSENCE_NOTE_ATTACHMENT_STORAGE_CLEANUP_FAILED",
        targetType: "AbsenceNote",
        targetId: String(note.id),
        before: toAuditJson(note.attachments.map((attachment) => attachment.storagePath)),
        after: toAuditJson({ error: storageCleanupError }),
        ipAddress: input.ipAddress ?? null,
      },
    });

    throw new Error(storageCleanupError);
  }

  const result = await getPrisma().$transaction(async (tx) => {
    const currentNote = await tx.absenceNote.findFirstOrThrow({
      where: {
        id: input.noteId,
        academyId,
      },
      include: {
        session: true,
      },
    });

    if (currentNote.status === AbsenceStatus.APPROVED) {
      await revertApprovedAbsenceNote(tx, currentNote);
    }

    await tx.absenceNote.delete({
      where: {
        id: input.noteId,
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "ABSENCE_NOTE_DELETE",
        targetType: "AbsenceNote",
        targetId: String(currentNote.id),
        before: toAuditJson(note),
        after: toAuditJson(null),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      note: currentNote,
      shouldRecalculate: currentNote.status === AbsenceStatus.APPROVED,
    };
  });

  if (result.shouldRecalculate) {
    await recalculateStatusCache(result.note.session.periodId, result.note.session.examType, {
      examNumbers: [result.note.examNumber],
    });
  }

  return {
    success: true,
    storageCleanupError: null,
  };
}
