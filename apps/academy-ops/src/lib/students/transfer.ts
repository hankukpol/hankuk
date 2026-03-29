import { Prisma } from "@prisma/client";
import { toAuditJson } from "@/lib/audit";
import { revalidateAdminReadCaches } from "@/lib/cache-tags";
import { getPrisma } from "@/lib/prisma";

type TransferCountMap = {
  scores: number;
  enrollments: number;
  absenceNotes: number;
  counselingRecords: number;
  counselingAppointments: number;
  pointLogs: number;
  weeklyStatusSnapshots: number;
  studentAnswers: number;
  wrongNoteBookmarks: number;
  notifications: number;
};

function cloneJsonValue(value: unknown) {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function buildTransferCounts(source: {
  _count: TransferCountMap;
}) {
  return {
    scores: source._count.scores,
    enrollments: source._count.enrollments,
    absenceNotes: source._count.absenceNotes,
    counselingRecords: source._count.counselingRecords,
    counselingAppointments: source._count.counselingAppointments,
    pointLogs: source._count.pointLogs,
    weeklyStatusSnapshots: source._count.weeklyStatusSnapshots,
    studentAnswers: source._count.studentAnswers,
    wrongNoteBookmarks: source._count.wrongNoteBookmarks,
    notifications: source._count.notifications,
  } satisfies TransferCountMap;
}

function appendTransferNote(note: string | null, toExamNumber: string) {
  const transferMessage = `[수험번호 이전] ${toExamNumber}로 데이터 이전 완료`;
  return note ? `${note}\n${transferMessage}` : transferMessage;
}

function normalizeExamNumber(value: string) {
  return value.trim();
}

export async function getStudentTransferPreview(input: {
  fromExamNumber: string;
  toExamNumber?: string;
}) {
  const fromExamNumber = normalizeExamNumber(input.fromExamNumber);
  const toExamNumber = normalizeExamNumber(input.toExamNumber ?? "");

  if (!fromExamNumber) {
    throw new Error("기존 수험번호를 입력해 주세요.");
  }

  const prisma = getPrisma();
  const source = await prisma.student.findUnique({
    where: { examNumber: fromExamNumber },
    select: {
      examNumber: true,
      name: true,
      phone: true,
      generation: true,
      className: true,
      examType: true,
      studentType: true,
      onlineId: true,
      registeredAt: true,
      note: true,
      isActive: true,
      notificationConsent: true,
      currentStatus: true,
      _count: {
        select: {
          scores: true,
          enrollments: true,
          absenceNotes: true,
          counselingRecords: true,
          counselingAppointments: true,
          pointLogs: true,
          weeklyStatusSnapshots: true,
          studentAnswers: true,
          wrongNoteBookmarks: true,
          notifications: true,
        },
      },
    },
  });

  if (!source) {
    throw new Error("기존 수험번호의 학생을 찾을 수 없습니다.");
  }

  const targetStudent = toExamNumber
    ? await prisma.student.findUnique({
        where: { examNumber: toExamNumber },
        select: {
          examNumber: true,
          name: true,
          isActive: true,
        },
      })
    : null;

  const counts = buildTransferCounts(source);

  return {
    sourceStudent: {
      examNumber: source.examNumber,
      name: source.name,
      phone: source.phone,
      generation: source.generation,
      className: source.className,
      examType: source.examType,
      studentType: source.studentType,
      onlineId: source.onlineId,
      registeredAt: source.registeredAt,
      note: source.note,
      isActive: source.isActive,
      notificationConsent: source.notificationConsent,
      currentStatus: source.currentStatus,
    },
    targetStudent,
    counts,
    totalLinkedCount: Object.values(counts).reduce((sum, value) => sum + value, 0),
    canTransfer:
      Boolean(toExamNumber) && toExamNumber !== fromExamNumber && targetStudent === null,
    conflictReason:
      !toExamNumber
        ? "새 수험번호를 입력해 주세요."
        : toExamNumber === fromExamNumber
          ? "기존 수험번호와 새 수험번호는 같을 수 없습니다."
          : targetStudent
            ? "새 수험번호가 이미 사용 중입니다."
            : null,
  };
}

export async function transferStudentData(input: {
  adminId: string;
  fromExamNumber: string;
  toExamNumber: string;
  ipAddress?: string | null;
}) {
  const fromExamNumber = normalizeExamNumber(input.fromExamNumber);
  const toExamNumber = normalizeExamNumber(input.toExamNumber);

  if (!fromExamNumber || !toExamNumber) {
    throw new Error("기존 수험번호와 새 수험번호를 모두 입력해 주세요.");
  }

  if (fromExamNumber === toExamNumber) {
    throw new Error("기존 수험번호와 새 수험번호는 같을 수 없습니다.");
  }

  const prisma = getPrisma();

  const result = await prisma.$transaction(async (tx) => {
    const source = await tx.student.findUniqueOrThrow({
      where: { examNumber: fromExamNumber },
      select: {
        examNumber: true,
        name: true,
        phone: true,
        generation: true,
        className: true,
        examType: true,
        studentType: true,
        onlineId: true,
        registeredAt: true,
        note: true,
        isActive: true,
        notificationConsent: true,
        consentedAt: true,
        targetScores: true,
        currentStatus: true,
        statusUpdatedAt: true,
        createdAt: true,
        _count: {
          select: {
            scores: true,
            enrollments: true,
            absenceNotes: true,
            counselingRecords: true,
            counselingAppointments: true,
            pointLogs: true,
            weeklyStatusSnapshots: true,
            studentAnswers: true,
            wrongNoteBookmarks: true,
            notifications: true,
          },
        },
      },
    });

    const existingTarget = await tx.student.findUnique({
      where: { examNumber: toExamNumber },
      select: { examNumber: true, name: true },
    });

    if (existingTarget) {
      throw new Error("새 수험번호가 이미 사용 중입니다.");
    }

    const counts = buildTransferCounts(source);
    const originalOnlineId = source.onlineId;

    if (originalOnlineId) {
      await tx.student.update({
        where: { examNumber: fromExamNumber },
        data: { onlineId: null },
      });
    }

    const createdStudent = await tx.student.create({
      data: {
        examNumber: toExamNumber,
        name: source.name,
        phone: source.phone,
        generation: source.generation,
        className: source.className,
        examType: source.examType,
        studentType: source.studentType,
        onlineId: originalOnlineId,
        registeredAt: source.registeredAt,
        note: source.note,
        isActive: source.isActive,
        notificationConsent: source.notificationConsent,
        consentedAt: source.consentedAt,
        targetScores: cloneJsonValue(source.targetScores),
        currentStatus: source.currentStatus,
        statusUpdatedAt: source.statusUpdatedAt,
        createdAt: source.createdAt,
      },
    });

    await Promise.all([
      tx.score.updateMany({
        where: { examNumber: fromExamNumber },
        data: { examNumber: toExamNumber },
      }),
      tx.periodEnrollment.updateMany({
        where: { examNumber: fromExamNumber },
        data: { examNumber: toExamNumber },
      }),
      tx.absenceNote.updateMany({
        where: { examNumber: fromExamNumber },
        data: { examNumber: toExamNumber },
      }),
      tx.counselingRecord.updateMany({
        where: { examNumber: fromExamNumber },
        data: { examNumber: toExamNumber },
      }),
      tx.counselingAppointment.updateMany({
        where: { examNumber: fromExamNumber },
        data: { examNumber: toExamNumber },
      }),
      tx.pointLog.updateMany({
        where: { examNumber: fromExamNumber },
        data: { examNumber: toExamNumber },
      }),
      tx.weeklyStatusSnapshot.updateMany({
        where: { examNumber: fromExamNumber },
        data: { examNumber: toExamNumber },
      }),
      tx.studentAnswer.updateMany({
        where: { examNumber: fromExamNumber },
        data: { examNumber: toExamNumber },
      }),
      tx.wrongNoteBookmark.updateMany({
        where: { examNumber: fromExamNumber },
        data: { examNumber: toExamNumber },
      }),
      tx.notificationLog.updateMany({
        where: { examNumber: fromExamNumber },
        data: { examNumber: toExamNumber },
      }),
    ]);

    const deactivatedSource = await tx.student.update({
      where: { examNumber: fromExamNumber },
      data: {
        isActive: false,
        note: appendTransferNote(source.note, toExamNumber),
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "STUDENT_TRANSFER",
        targetType: "Student",
        targetId: toExamNumber,
        before: toAuditJson({
          sourceStudent: source,
          transferCounts: counts,
        }),
        after: toAuditJson({
          fromExamNumber,
          toExamNumber,
          createdStudent,
          deactivatedSource,
          transferCounts: counts,
        }),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      fromExamNumber,
      toExamNumber,
      transferCounts: counts,
      sourceStudent: deactivatedSource,
      targetStudent: createdStudent,
    };
  });

  revalidateAdminReadCaches({ analytics: true, periods: false });
  return result;
}
