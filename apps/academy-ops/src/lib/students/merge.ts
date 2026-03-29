import { AbsenceStatus, AttendType, ExamType, Prisma } from "@prisma/client";
import { toAuditJson } from "@/lib/audit";
import { revalidateAdminReadCaches } from "@/lib/cache-tags";
import { recalculateStatusCache } from "@/lib/analytics/service";
import { getPrisma } from "@/lib/prisma";

type MergeCountMap = {
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

type MergeConflictMap = {
  scores: number;
  enrollments: number;
  absenceNotes: number;
  weeklyStatusSnapshots: number;
  studentAnswers: number;
  wrongNoteBookmarks: number;
};

type ImpactedPair = {
  periodId: number;
  examType: ExamType;
};

const ATTEND_TYPE_PRIORITY: Record<AttendType, number> = {
  NORMAL: 4,
  LIVE: 3,
  EXCUSED: 2,
  ABSENT: 1,
};

const ABSENCE_STATUS_PRIORITY: Record<AbsenceStatus, number> = {
  APPROVED: 3,
  PENDING: 2,
  REJECTED: 1,
};

function normalizeExamNumber(value: string) {
  return value.trim();
}

function cloneJsonValue(value: Prisma.JsonValue | null) {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function combineDistinctText(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const lines = values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });

  return lines.length > 0 ? lines.join("\n\n") : null;
}

function pickEarlierDate(left: Date | null, right: Date | null) {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() <= right.getTime() ? left : right;
}

function mergeAttendType(existing: AttendType, incoming: AttendType) {
  return ATTEND_TYPE_PRIORITY[incoming] > ATTEND_TYPE_PRIORITY[existing]
    ? incoming
    : existing;
}

function mergeAbsenceStatus(existing: AbsenceStatus, incoming: AbsenceStatus) {
  return ABSENCE_STATUS_PRIORITY[incoming] > ABSENCE_STATUS_PRIORITY[existing]
    ? incoming
    : existing;
}

function computeFinalScore(
  rawScore: number | null,
  oxScore: number | null,
  fallback: number | null,
) {
  if (rawScore !== null || oxScore !== null) {
    return (rawScore ?? 0) + (oxScore ?? 0);
  }

  return fallback;
}

function buildMergeCounts(source: { _count: MergeCountMap }) {
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
  } satisfies MergeCountMap;
}

function countOverlap<T>(sourceValues: T[], targetValues: T[]) {
  const targetSet = new Set(targetValues);
  return sourceValues.filter((value) => targetSet.has(value)).length;
}

function buildSnapshotKey(periodId: number, weekKey: string) {
  return `${periodId}:${weekKey}`;
}

function appendSourceMergeNote(note: string | null, targetExamNumber: string) {
  return combineDistinctText([note, `[학생 병합] ${targetExamNumber} 계정으로 데이터 병합 완료`]);
}

function appendTargetMergeNote(note: string | null, sourceExamNumber: string) {
  return combineDistinctText([note, `[학생 병합] ${sourceExamNumber} 계정의 데이터를 병합했습니다.`]);
}

function addImpactedPair(map: Map<string, ImpactedPair>, pair: ImpactedPair) {
  map.set(`${pair.periodId}:${pair.examType}`, pair);
}

async function collectMergePreviewData(sourceExamNumber: string, targetExamNumber: string) {
  const prisma = getPrisma();

  const [sourceStudent, targetStudent] = await Promise.all([
    prisma.student.findUnique({
      where: { examNumber: sourceExamNumber },
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
        currentStatus: true,
        targetScores: true,
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
    }),
    prisma.student.findUnique({
      where: { examNumber: targetExamNumber },
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
        currentStatus: true,
        targetScores: true,
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
    }),
  ]);

  if (!sourceStudent) {
    throw new Error("병합 원본 학생을 찾을 수 없습니다.");
  }

  if (!targetStudent) {
    throw new Error("병합 대상 학생을 찾을 수 없습니다.");
  }

  const [
    sourceScoreKeys,
    targetScoreKeys,
    sourceAbsenceKeys,
    targetAbsenceKeys,
    sourceEnrollmentKeys,
    targetEnrollmentKeys,
    sourceSnapshotKeys,
    targetSnapshotKeys,
    sourceAnswerKeys,
    targetAnswerKeys,
    sourceBookmarkKeys,
    targetBookmarkKeys,
  ] = await Promise.all([
    prisma.score.findMany({ where: { examNumber: sourceExamNumber }, select: { sessionId: true } }),
    prisma.score.findMany({ where: { examNumber: targetExamNumber }, select: { sessionId: true } }),
    prisma.absenceNote.findMany({ where: { examNumber: sourceExamNumber }, select: { sessionId: true } }),
    prisma.absenceNote.findMany({ where: { examNumber: targetExamNumber }, select: { sessionId: true } }),
    prisma.periodEnrollment.findMany({ where: { examNumber: sourceExamNumber }, select: { periodId: true } }),
    prisma.periodEnrollment.findMany({ where: { examNumber: targetExamNumber }, select: { periodId: true } }),
    prisma.weeklyStatusSnapshot.findMany({ where: { examNumber: sourceExamNumber }, select: { periodId: true, weekKey: true } }),
    prisma.weeklyStatusSnapshot.findMany({ where: { examNumber: targetExamNumber }, select: { periodId: true, weekKey: true } }),
    prisma.studentAnswer.findMany({ where: { examNumber: sourceExamNumber }, select: { questionId: true } }),
    prisma.studentAnswer.findMany({ where: { examNumber: targetExamNumber }, select: { questionId: true } }),
    prisma.wrongNoteBookmark.findMany({ where: { examNumber: sourceExamNumber }, select: { questionId: true } }),
    prisma.wrongNoteBookmark.findMany({ where: { examNumber: targetExamNumber }, select: { questionId: true } }),
  ]);

  const sourceCounts = buildMergeCounts(sourceStudent);
  const targetCounts = buildMergeCounts(targetStudent);
  const conflictCounts = {
    scores: countOverlap(
      sourceScoreKeys.map((row) => row.sessionId),
      targetScoreKeys.map((row) => row.sessionId),
    ),
    enrollments: countOverlap(
      sourceEnrollmentKeys.map((row) => row.periodId),
      targetEnrollmentKeys.map((row) => row.periodId),
    ),
    absenceNotes: countOverlap(
      sourceAbsenceKeys.map((row) => row.sessionId),
      targetAbsenceKeys.map((row) => row.sessionId),
    ),
    weeklyStatusSnapshots: countOverlap(
      sourceSnapshotKeys.map((row) => buildSnapshotKey(row.periodId, row.weekKey)),
      targetSnapshotKeys.map((row) => buildSnapshotKey(row.periodId, row.weekKey)),
    ),
    studentAnswers: countOverlap(
      sourceAnswerKeys.map((row) => row.questionId),
      targetAnswerKeys.map((row) => row.questionId),
    ),
    wrongNoteBookmarks: countOverlap(
      sourceBookmarkKeys.map((row) => row.questionId),
      targetBookmarkKeys.map((row) => row.questionId),
    ),
  } satisfies MergeConflictMap;

  const warnings: string[] = [];

  if (sourceStudent.name !== targetStudent.name) {
    warnings.push("학생 이름이 서로 다릅니다. 같은 학생인지 다시 확인해 주세요.");
  }

  if (sourceStudent.onlineId && targetStudent.onlineId && sourceStudent.onlineId !== targetStudent.onlineId) {
    warnings.push("양쪽 학생에 서로 다른 온라인 ID가 있습니다. 대상 학생의 온라인 ID를 유지하고 원본 ID는 해제합니다.");
  }

  if (Object.values(conflictCounts).some((value) => value > 0)) {
    warnings.push("겹치는 회차/질문 데이터는 대상 학생 기준으로 병합하거나 중복을 정리합니다.");
  }

  if (!targetStudent.isActive && sourceStudent.isActive) {
    warnings.push("대상 학생은 현재 비활성 상태입니다. 병합 후 활성 상태로 복구됩니다.");
  }

  const canMerge =
    sourceExamNumber !== targetExamNumber &&
    sourceStudent.examType === targetStudent.examType;

  const conflictReason =
    sourceExamNumber === targetExamNumber
      ? "원본과 대상 수험번호는 같을 수 없습니다."
      : sourceStudent.examType !== targetStudent.examType
        ? "직렬이 다른 학생은 병합할 수 없습니다."
        : null;

  return {
    sourceStudent,
    targetStudent,
    sourceCounts,
    targetCounts,
    conflictCounts,
    totalSourceLinkedCount: Object.values(sourceCounts).reduce((sum, value) => sum + value, 0),
    totalTargetLinkedCount: Object.values(targetCounts).reduce((sum, value) => sum + value, 0),
    totalConflictCount: Object.values(conflictCounts).reduce((sum, value) => sum + value, 0),
    warnings,
    canMerge,
    conflictReason,
  };
}

export async function getStudentMergePreview(input: {
  sourceExamNumber: string;
  targetExamNumber: string;
}) {
  const sourceExamNumber = normalizeExamNumber(input.sourceExamNumber);
  const targetExamNumber = normalizeExamNumber(input.targetExamNumber);

  if (!sourceExamNumber || !targetExamNumber) {
    throw new Error("원본과 대상 수험번호를 모두 입력해 주세요.");
  }

  return collectMergePreviewData(sourceExamNumber, targetExamNumber);
}

export async function mergeStudentData(input: {
  adminId: string;
  sourceExamNumber: string;
  targetExamNumber: string;
  ipAddress?: string | null;
}) {
  const sourceExamNumber = normalizeExamNumber(input.sourceExamNumber);
  const targetExamNumber = normalizeExamNumber(input.targetExamNumber);

  if (!sourceExamNumber || !targetExamNumber) {
    throw new Error("원본과 대상 수험번호를 모두 입력해 주세요.");
  }

  if (sourceExamNumber === targetExamNumber) {
    throw new Error("원본과 대상 수험번호는 같을 수 없습니다.");
  }

  const prisma = getPrisma();

  const result = await prisma.$transaction(async (tx) => {
    const source = await tx.student.findUniqueOrThrow({
      where: { examNumber: sourceExamNumber },
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

    const target = await tx.student.findUniqueOrThrow({
      where: { examNumber: targetExamNumber },
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

    if (source.examType !== target.examType) {
      throw new Error("직렬이 다른 학생은 병합할 수 없습니다.");
    }

    const [
      sourceScores,
      targetScores,
      sourceAbsenceNotes,
      targetAbsenceNotes,
      sourceEnrollments,
      targetEnrollments,
      sourceSnapshots,
      targetSnapshots,
      sourceAnswers,
      targetAnswers,
      sourceBookmarks,
      targetBookmarks,
      preview,
    ] = await Promise.all([
      tx.score.findMany({
        where: { examNumber: sourceExamNumber },
        select: {
          id: true,
          sessionId: true,
          rawScore: true,
          oxScore: true,
          finalScore: true,
          attendType: true,
          sourceType: true,
          note: true,
          session: { select: { periodId: true, examType: true } },
        },
      }),
      tx.score.findMany({
        where: { examNumber: targetExamNumber },
        select: {
          id: true,
          sessionId: true,
          rawScore: true,
          oxScore: true,
          finalScore: true,
          attendType: true,
          sourceType: true,
          note: true,
          session: { select: { periodId: true, examType: true } },
        },
      }),
      tx.absenceNote.findMany({
        where: { examNumber: sourceExamNumber },
        select: {
          id: true,
          sessionId: true,
          reason: true,
          absenceCategory: true,
          submittedAt: true,
          approvedAt: true,
          status: true,
          attendGrantsPerfectAttendance: true,
          adminNote: true,
          session: { select: { periodId: true, examType: true } },
        },
      }),
      tx.absenceNote.findMany({
        where: { examNumber: targetExamNumber },
        select: {
          id: true,
          sessionId: true,
          reason: true,
          absenceCategory: true,
          submittedAt: true,
          approvedAt: true,
          status: true,
          attendGrantsPerfectAttendance: true,
          adminNote: true,
          session: { select: { periodId: true, examType: true } },
        },
      }),
      tx.periodEnrollment.findMany({
        where: { examNumber: sourceExamNumber },
        select: { id: true, periodId: true },
      }),
      tx.periodEnrollment.findMany({
        where: { examNumber: targetExamNumber },
        select: { id: true, periodId: true },
      }),
      tx.weeklyStatusSnapshot.findMany({
        where: { examNumber: sourceExamNumber },
        select: { id: true, periodId: true, examType: true, weekKey: true },
      }),
      tx.weeklyStatusSnapshot.findMany({
        where: { examNumber: targetExamNumber },
        select: { id: true, periodId: true, examType: true, weekKey: true },
      }),
      tx.studentAnswer.findMany({
        where: { examNumber: sourceExamNumber },
        select: { id: true, questionId: true },
      }),
      tx.studentAnswer.findMany({
        where: { examNumber: targetExamNumber },
        select: { id: true, questionId: true },
      }),
      tx.wrongNoteBookmark.findMany({
        where: { examNumber: sourceExamNumber },
        select: { id: true, questionId: true, memo: true },
      }),
      tx.wrongNoteBookmark.findMany({
        where: { examNumber: targetExamNumber },
        select: { id: true, questionId: true, memo: true },
      }),
      collectMergePreviewData(sourceExamNumber, targetExamNumber),
    ]);

    const sourceCounts = buildMergeCounts(source);
    const impactedPairs = new Map<string, ImpactedPair>();

    for (const score of [...sourceScores, ...targetScores]) {
      addImpactedPair(impactedPairs, { periodId: score.session.periodId, examType: score.session.examType });
    }

    for (const note of [...sourceAbsenceNotes, ...targetAbsenceNotes]) {
      addImpactedPair(impactedPairs, { periodId: note.session.periodId, examType: note.session.examType });
    }

    for (const snapshot of [...sourceSnapshots, ...targetSnapshots]) {
      addImpactedPair(impactedPairs, { periodId: snapshot.periodId, examType: snapshot.examType });
    }

    const targetScoreBySession = new Map(targetScores.map((score) => [score.sessionId, score]));
    for (const score of sourceScores) {
      const targetScore = targetScoreBySession.get(score.sessionId);
      if (!targetScore) {
        await tx.score.update({ where: { id: score.id }, data: { examNumber: targetExamNumber } });
        continue;
      }

      const rawScore = targetScore.rawScore ?? score.rawScore ?? null;
      const oxScore = targetScore.oxScore ?? score.oxScore ?? null;
      const finalScore = computeFinalScore(rawScore, oxScore, targetScore.finalScore ?? score.finalScore ?? null);

      await tx.score.update({
        where: { id: targetScore.id },
        data: {
          rawScore,
          oxScore,
          finalScore,
          attendType: mergeAttendType(targetScore.attendType, score.attendType),
          note: combineDistinctText([targetScore.note, score.note]),
        },
      });

      await tx.score.delete({ where: { id: score.id } });
    }

    const targetAbsenceBySession = new Map(targetAbsenceNotes.map((note) => [note.sessionId, note]));
    for (const note of sourceAbsenceNotes) {
      const targetNote = targetAbsenceBySession.get(note.sessionId);
      if (!targetNote) {
        await tx.absenceNote.update({ where: { id: note.id }, data: { examNumber: targetExamNumber } });
        continue;
      }

      const status = mergeAbsenceStatus(targetNote.status, note.status);

      await tx.absenceNote.update({
        where: { id: targetNote.id },
        data: {
          reason: combineDistinctText([targetNote.reason, note.reason]) ?? targetNote.reason,
          absenceCategory: targetNote.absenceCategory ?? note.absenceCategory,
          submittedAt: pickEarlierDate(targetNote.submittedAt, note.submittedAt),
          approvedAt:
            status === AbsenceStatus.APPROVED
              ? pickEarlierDate(targetNote.approvedAt, note.approvedAt)
              : targetNote.approvedAt ?? note.approvedAt,
          status,
          attendGrantsPerfectAttendance:
            targetNote.attendGrantsPerfectAttendance || note.attendGrantsPerfectAttendance,
          adminNote: combineDistinctText([targetNote.adminNote, note.adminNote]),
        },
      });

      await tx.absenceNote.delete({ where: { id: note.id } });
    }

    const targetEnrollmentPeriods = new Set(targetEnrollments.map((row) => row.periodId));
    for (const enrollment of sourceEnrollments) {
      if (targetEnrollmentPeriods.has(enrollment.periodId)) {
        await tx.periodEnrollment.delete({ where: { id: enrollment.id } });
      } else {
        await tx.periodEnrollment.update({ where: { id: enrollment.id }, data: { examNumber: targetExamNumber } });
      }
    }

    await Promise.all([
      tx.counselingRecord.updateMany({ where: { examNumber: sourceExamNumber }, data: { examNumber: targetExamNumber } }),
      tx.counselingAppointment.updateMany({ where: { examNumber: sourceExamNumber }, data: { examNumber: targetExamNumber } }),
      tx.pointLog.updateMany({ where: { examNumber: sourceExamNumber }, data: { examNumber: targetExamNumber } }),
      tx.notificationLog.updateMany({ where: { examNumber: sourceExamNumber }, data: { examNumber: targetExamNumber } }),
    ]);

    const targetAnswerByQuestion = new Map(targetAnswers.map((answer) => [answer.questionId, answer]));
    for (const answer of sourceAnswers) {
      if (targetAnswerByQuestion.has(answer.questionId)) {
        await tx.studentAnswer.delete({ where: { id: answer.id } });
        continue;
      }

      await tx.studentAnswer.update({ where: { id: answer.id }, data: { examNumber: targetExamNumber } });
    }

    const targetBookmarkByQuestion = new Map(targetBookmarks.map((bookmark) => [bookmark.questionId, bookmark]));
    for (const bookmark of sourceBookmarks) {
      const targetBookmark = targetBookmarkByQuestion.get(bookmark.questionId);
      if (targetBookmark) {
        await tx.wrongNoteBookmark.update({
          where: { id: targetBookmark.id },
          data: { memo: combineDistinctText([targetBookmark.memo, bookmark.memo]) },
        });
        await tx.wrongNoteBookmark.delete({ where: { id: bookmark.id } });
        continue;
      }

      await tx.wrongNoteBookmark.update({ where: { id: bookmark.id }, data: { examNumber: targetExamNumber } });
    }

    await tx.weeklyStatusSnapshot.deleteMany({ where: { examNumber: sourceExamNumber } });

    if (source.onlineId) {
      await tx.student.update({ where: { examNumber: sourceExamNumber }, data: { onlineId: null } });
    }

    const targetStudent = await tx.student.update({
      where: { examNumber: targetExamNumber },
      data: {
        phone: target.phone ?? source.phone,
        generation: target.generation ?? source.generation,
        className: target.className ?? source.className,
        onlineId: target.onlineId ?? source.onlineId,
        registeredAt: pickEarlierDate(target.registeredAt, source.registeredAt),
        note: appendTargetMergeNote(combineDistinctText([target.note, source.note]), sourceExamNumber),
        isActive: target.isActive || source.isActive,
        notificationConsent: target.notificationConsent || source.notificationConsent,
        consentedAt: target.consentedAt ?? source.consentedAt,
        targetScores:
          target.targetScores !== null
            ? cloneJsonValue(target.targetScores)
            : source.targetScores !== null
              ? cloneJsonValue(source.targetScores)
              : Prisma.JsonNull,
      },
    });

    const sourceStudent = await tx.student.update({
      where: { examNumber: sourceExamNumber },
      data: {
        isActive: false,
        onlineId: null,
        note: appendSourceMergeNote(source.note, targetExamNumber),
      },
    });

    await tx.auditLog.create({
      data: {
        adminId: input.adminId,
        action: "STUDENT_MERGE",
        targetType: "Student",
        targetId: targetExamNumber,
        before: toAuditJson({
          sourceStudent: source,
          targetStudent: target,
          sourceCounts,
          conflictCounts: preview.conflictCounts,
        }),
        after: toAuditJson({
          sourceExamNumber,
          targetExamNumber,
          sourceStudent,
          targetStudent,
          sourceCounts,
          conflictCounts: preview.conflictCounts,
        }),
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      sourceExamNumber,
      targetExamNumber,
      sourceCounts,
      conflictCounts: preview.conflictCounts,
      impactedPairs: Array.from(impactedPairs.values()),
    };
  });

  await Promise.all(
    result.impactedPairs.map((pair) =>
      recalculateStatusCache(pair.periodId, pair.examType, {
        examNumbers: [result.sourceExamNumber, result.targetExamNumber],
      }),
    ),
  );
  revalidateAdminReadCaches({ analytics: true, periods: false });

  return {
    sourceExamNumber: result.sourceExamNumber,
    targetExamNumber: result.targetExamNumber,
    sourceCounts: result.sourceCounts,
    conflictCounts: result.conflictCounts,
  };
}
