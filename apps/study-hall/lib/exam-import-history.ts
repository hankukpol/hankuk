import type { ExamImportHistoryRow } from "@/lib/exam-import-types";

export type HistorySession = {
  id: string; divisionId: string; examTypeId: string; primarySubjectId: string | null;
  examDate: Date | string; topic: string | null; itemCount: number;
  externalCohortSize: number; importedById: string; importedAt: Date | string;
};
export type DerivedScore = {
  id: string; studentId: string; examTypeId: string; examDate: Date | string | null;
  recordedById: string; createdAt: Date | string; updatedAt?: Date | string;
  notes: string | null;
  examRound?: number; scores?: unknown; totalScore?: number | null; rankInClass?: number | null;
  subjectId?: string; score?: number | null; weekNumber?: number; weekYear?: number;
};
export type DerivedScoreProof = {
  studentId: string; derivedScoreId?: string | null; derivedScoreSnapshot?: unknown;
};
export const examDateString = (date: Date | string | null | undefined) =>
  date instanceof Date ? date.toISOString().slice(0, 10) : (date ?? "").slice(0, 10);
const instant = (date: Date | string) => new Date(date).toISOString();

/** Whitelisted complete scalar record; no names, file contents or external individuals. */
export function derivedScoreSnapshot(row: DerivedScore) {
  return {
    version: 1,
    record: {
      id: row.id, studentId: row.studentId, examTypeId: row.examTypeId,
      examDate: examDateString(row.examDate), recordedById: row.recordedById,
      createdAt: instant(row.createdAt), updatedAt: row.updatedAt ? instant(row.updatedAt) : null,
      notes: row.notes,
      ...(row.subjectId === undefined ? {
        examRound: row.examRound, scores: row.scores,
        totalScore: row.totalScore, rankInClass: row.rankInClass,
      } : {
        subjectId: row.subjectId, score: row.score, weekNumber: row.weekNumber, weekYear: row.weekYear,
      }),
    },
  };
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
}
export function scoreBelongsToSession(row: Pick<DerivedScore, "examTypeId" | "examDate" | "subjectId">, session: HistorySession) {
  return row.examTypeId === session.examTypeId && examDateString(row.examDate) === examDateString(session.examDate) &&
    (session.primarySubjectId === null ? row.subjectId === undefined : row.subjectId === session.primarySubjectId);
}

/** Pure decision shared by mock/DB. Missing/edited proofs never authorize deletion. */
export function planExamImportDeletion(session: HistorySession, participants: DerivedScoreProof[], legacy: DerivedScore[]) {
  const scoped = legacy.filter((row) => scoreBelongsToSession(row, session));
  const deletable = scoped.filter((row) => {
    const proofs = participants.filter((participant) => participant.studentId === row.studentId && participant.derivedScoreId === row.id);
    if (proofs.length !== 1 || !row.updatedAt || !proofs[0].derivedScoreSnapshot) return false;
    return canonical(proofs[0].derivedScoreSnapshot) === canonical(derivedScoreSnapshot(row));
  });
  return {
    deletable,
    removedStudents: new Set(participants.map((row) => row.studentId)).size,
    keptManualScores: scoped.length - deletable.length,
  };
}

export type HistoryBundle = {
  sessions: HistorySession[];
  participants: Array<{ divisionId: string; sessionId: string; studentId: string }>;
  examTypes: Array<{ id: string; name: string; category: "REGULAR" | "MORNING"; subjects: Array<{ id: string; name: string }> }>;
  admins: Array<{ id: string; name: string }>;
};
export function assembleExamImportHistory(bundle: HistoryBundle, divisionId: string, options: { examTypeId?: string } = {}): ExamImportHistoryRow[] {
  return bundle.sessions.filter((row) => row.divisionId === divisionId && (!options.examTypeId || row.examTypeId === options.examTypeId))
    .map((session) => {
      const examType = bundle.examTypes.find((row) => row.id === session.examTypeId);
      return {
        sessionId: session.id,
        examTypeName: examType?.name ?? "삭제된 시험 종류",
        examDate: examDateString(session.examDate),
        primarySubjectName: examType?.subjects.find((row) => row.id === session.primarySubjectId)?.name ?? null,
        topic: session.topic, itemCount: session.itemCount, externalCohortSize: session.externalCohortSize,
        matchedStudentCount: new Set(bundle.participants.filter((row) => row.divisionId === divisionId && row.sessionId === session.id).map((row) => row.studentId)).size,
        importedByName: bundle.admins.find((row) => row.id === session.importedById)?.name ?? null,
        importedAt: instant(session.importedAt),
      };
    }).sort((a, b) => b.examDate.localeCompare(a.examDate) || b.importedAt.localeCompare(a.importedAt) || a.sessionId.localeCompare(b.sessionId));
}
