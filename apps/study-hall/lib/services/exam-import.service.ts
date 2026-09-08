import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { AdminSession } from "@/lib/auth";
import {
  assembleExamImport,
  type ImportAssembly,
  type ImportExamType,
  type ImportStudent,
} from "@/lib/exam-import-assembler";
import {
  parseExamImportPair,
  ExamImportParseError,
  type ParsedExamImport,
} from "@/lib/exam-import-parser";
import type {
  ExamImportSelection,
  ExamImportResult,
} from "@/lib/exam-import-types";
import { buildExamSessionIdentity } from "@/lib/exam-session-identity";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { isMockMode } from "@/lib/mock-data";
import {
  getDivisionBySlugOrThrow,
  getPrismaClient,
} from "@/lib/service-helpers";
import { getIsoWeekInfo } from "@/lib/services/morning-exam.service";
import type { MockExamSessionRecord } from "@/lib/mock-store";

export type ExamImportFiles = { scoreBuffer: Buffer; analysisBuffer: Buffer };
function participantRecord(
  participant: ImportAssembly["participants"][number],
) {
  return {
    studentId: participant.studentId,
    region: participant.region,
    subjectScores: participant.subjectScores,
    totalScore: participant.totalScore,
    isPartial: participant.isPartial,
    externalRank: participant.externalRank,
    externalPercentile: participant.externalPercentile,
    regionalRank: participant.regionalRank,
  };
}
type ImportActor = Pick<AdminSession, "id" | "role" | "divisionId">;
type Source = {
  divisionId: string;
  examTypes: ImportExamType[];
  students: ImportStudent[];
  sessions: Pick<MockExamSessionRecord, "id" | "examTypeId" | "identityKey">[];
  legacy: {
    examTypeId: string;
    examRound?: number;
    subjectId?: string;
    examDate?: Date | string | null;
  }[];
};
function authorize(actor: ImportActor, divisionId: string) {
  if (
    actor.role !== "SUPER_ADMIN" &&
    (actor.role !== "ADMIN" || actor.divisionId !== divisionId)
  )
    throw forbidden("성적 가져오기 권한이 없습니다.");
}
function parse(files: ExamImportFiles) {
  try {
    return parseExamImportPair(files.scoreBuffer, files.analysisBuffer);
  } catch (error) {
    if (error instanceof ExamImportParseError) throw badRequest(error.message);
    throw badRequest(
      "파일을 읽을 수 없습니다. 채점표와 문항분석표를 확인해주세요.",
    );
  }
}
function identity(assembly: ImportAssembly, selection: ExamImportSelection) {
  return buildExamSessionIdentity({
    category: selection.category,
    examDate: assembly.preview.examDate,
    examRound: selection.examRound ?? null,
    morningSubjectId: assembly.morningSubjectId,
  });
}
function assemble(
  source: Source,
  parsed: ParsedExamImport,
  selection: ExamImportSelection,
) {
  const result = assembleExamImport(
    parsed,
    source.examTypes,
    source.students,
    selection,
  );
  if (
    result.preview.examTypeId &&
    (selection.category === "MORNING" || selection.examRound)
  ) {
    const key = identity(result, selection);
    result.preview.existing =
      source.sessions.some(
        (row) =>
          row.examTypeId === result.preview.examTypeId &&
          row.identityKey === key,
      ) ||
      source.legacy.some(
        (row) =>
          row.examTypeId === result.preview.examTypeId &&
          (selection.category === "REGULAR"
            ? row.examRound === selection.examRound
            : row.subjectId === result.morningSubjectId &&
              String(
                row.examDate instanceof Date
                  ? row.examDate.toISOString().slice(0, 10)
                  : row.examDate,
              ).slice(0, 10) === result.preview.examDate),
      );
  }
  return result;
}
async function loadDb(
  tx: Prisma.TransactionClient,
  divisionId: string,
): Promise<Source> {
  const [examTypes, students, sessions, regular, morning] = await Promise.all([
    tx.examType.findMany({
      where: { divisionId },
      include: { subjects: true },
    }),
    tx.student.findMany({
      where: { divisionId },
      select: { id: true, name: true, studentNumber: true },
    }),
    tx.examSession.findMany({
      where: { divisionId },
      select: { id: true, examTypeId: true, identityKey: true },
    }),
    tx.examScore.findMany({
      where: { examType: { divisionId }, student: { divisionId } },
      select: { examTypeId: true, examRound: true },
    }),
    tx.morningExamScore.findMany({
      where: { examType: { divisionId }, student: { divisionId } },
      select: { examTypeId: true, subjectId: true, examDate: true },
    }),
  ]);
  return {
    divisionId,
    examTypes,
    students,
    sessions,
    legacy: [...regular, ...morning],
  };
}
type MockState = Awaited<
  ReturnType<typeof import("@/lib/mock-store").readMockState>
>;
function loadMock(state: MockState, slug: string): Source {
  const division = state.divisions.find((row) => row.slug === slug);
  if (!division) throw notFound("지점을 찾을 수 없습니다.");
  return {
    divisionId: division.id,
    examTypes: state.examTypesByDivision[slug] ?? [],
    students: state.studentsByDivision[slug] ?? [],
    sessions: state.examSessionsByDivision[slug] ?? [],
    legacy: [
      ...(state.examScoresByDivision[slug] ?? []),
      ...(state.morningExamScoresByDivision[slug] ?? []),
    ],
  };
}
export async function previewExamImport(
  slug: string,
  actor: ImportActor,
  files: ExamImportFiles,
  selection: ExamImportSelection,
) {
  if (isMockMode()) return previewMock(slug, actor, files, selection);
  const division = await getDivisionBySlugOrThrow(slug);
  authorize(actor, division.id);
  const parsed = parse(files);
  const prisma = await getPrismaClient();
  return assemble(await loadDb(prisma, division.id), parsed, selection).preview;
}
async function previewMock(
  slug: string,
  actor: ImportActor,
  files: ExamImportFiles,
  selection: ExamImportSelection,
) {
  const { readMockState } = await import("@/lib/mock-store");
  const source = loadMock(await readMockState(), slug);
  authorize(actor, source.divisionId);
  return assemble(source, parse(files), selection).preview;
}
function validateConfirmation(
  assembly: ImportAssembly,
  selection: ExamImportSelection,
) {
  if (
    !selection.examTypeId ||
    (selection.category === "REGULAR" && !selection.examRound)
  )
    throw badRequest("시험 종류와 정기 시험 회차를 확인해주세요.");
  if (!assembly.preview.canConfirm)
    throw badRequest(
      "재현 검증과 학생 매칭 결과를 확인한 뒤 다시 가져와주세요.",
    );
  if (assembly.preview.existing && !selection.overwrite)
    throw conflict("이미 성적이 있습니다. 덮어쓰기를 확인해주세요.");
}
function sessionRecord(
  source: Source,
  assembly: ImportAssembly,
  actor: ImportActor,
  selection: ExamImportSelection,
): MockExamSessionRecord {
  return {
    id: randomUUID(),
    divisionId: source.divisionId,
    examTypeId: assembly.preview.examTypeId!,
    identityKey: identity(assembly, selection),
    morningSubjectId: assembly.morningSubjectId,
    examDate: assembly.preview.examDate,
    examRound: selection.category === "REGULAR" ? selection.examRound! : null,
    topic: selection.topic?.trim() || null,
    itemCount: assembly.preview.itemCount,
    fullScore: assembly.preview.fullScore,
    externalCohortSize: assembly.preview.cohortSize,
    externalStats: assembly.externalStats,
    sourceFileName: "grading.xls + analysis.xls",
    importedById: actor.id,
    importedAt: new Date().toISOString(),
  };
}
function importResult(
  session: MockExamSessionRecord,
  count: number,
): ExamImportResult {
  return {
    sessionId: session.id,
    subjectId: session.morningSubjectId,
    importedCount: count,
    examDate: session.examDate,
    examTypeId: session.examTypeId,
    examRound: session.examRound,
  };
}
export async function confirmExamImport(
  slug: string,
  actor: ImportActor,
  files: ExamImportFiles,
  selection: ExamImportSelection,
): Promise<ExamImportResult> {
  if (isMockMode()) return confirmMock(slug, actor, files, selection);
  const division = await getDivisionBySlugOrThrow(slug);
  authorize(actor, division.id);
  const parsed = parse(files);
  const prisma = await getPrismaClient();
  return prisma.$transaction(
    async (tx) => {
      // Serialize import/replacement on this tenant's exam type, including first-time imports.
      await tx.$queryRaw`SELECT id FROM study_hall.exam_types WHERE id = ${selection.examTypeId ?? ""} AND division_id = ${division.id} FOR UPDATE`;
      const source = await loadDb(tx, division.id);
      const assembly = assemble(source, parsed, selection);
      validateConfirmation(assembly, selection);
      const session = sessionRecord(source, assembly, actor, selection);
      const priorIds = source.sessions
        .filter(
          (row) =>
            row.examTypeId === session.examTypeId &&
            row.identityKey === session.identityKey,
        )
        .map((row) => row.id);
      await tx.examItemResponse.deleteMany({
        where: { divisionId: division.id, sessionId: { in: priorIds } },
      });
      await tx.examSessionParticipant.deleteMany({
        where: { divisionId: division.id, sessionId: { in: priorIds } },
      });
      await tx.examSessionItem.deleteMany({
        where: { divisionId: division.id, sessionId: { in: priorIds } },
      });
      await tx.examSession.deleteMany({
        where: { divisionId: division.id, id: { in: priorIds } },
      });
      await tx.examSession.create({
        data: {
          ...session,
          examDate: new Date(`${session.examDate}T00:00:00Z`),
          importedAt: new Date(session.importedAt),
        },
      });
      await tx.examSessionItem.createMany({
        data: assembly.items.map((item) => ({
          ...item,
          id: randomUUID(),
          divisionId: division.id,
          sessionId: session.id,
        })),
      });
      await tx.examSessionParticipant.createMany({
        data: assembly.participants.map((participant) => ({
          ...participantRecord(participant),
          id: randomUUID(),
          divisionId: division.id,
          sessionId: session.id,
        })),
      });
      const responseRows = assembly.participants.flatMap((participant) =>
        participant.responses.map((response) => ({
          ...response,
          id: randomUUID(),
          divisionId: division.id,
          sessionId: session.id,
          studentId: participant.studentId,
        })),
      );
      for (let offset = 0; offset < responseRows.length; offset += 1000)
        await tx.examItemResponse.createMany({
          data: responseRows.slice(offset, offset + 1000),
        });
      const examDate = new Date(`${session.examDate}T00:00:00Z`);
      if (selection.category === "REGULAR") {
        await tx.examScore.deleteMany({
          where: {
            examType: { divisionId: division.id },
            student: { divisionId: division.id },
            examTypeId: session.examTypeId,
            examRound: session.examRound!,
          },
        });
        await tx.examScore.createMany({
          data: assembly.participants.map((participant) => ({
            studentId: participant.studentId,
            examTypeId: session.examTypeId,
            examRound: session.examRound!,
            examDate,
            scores: participant.subjectScores,
            totalScore: participant.totalScore,
            rankInClass:
              1 +
              assembly.participants.filter(
                (other) => other.totalScore > participant.totalScore,
              ).length,
            recordedById: actor.id,
          })),
        });
      } else {
        await tx.morningExamScore.deleteMany({
          where: {
            examType: { divisionId: division.id },
            student: { divisionId: division.id },
            examTypeId: session.examTypeId,
            subjectId: session.morningSubjectId!,
            examDate,
          },
        });
        await tx.morningExamScore.createMany({
          data: assembly.participants.map((participant) => ({
            studentId: participant.studentId,
            examTypeId: session.examTypeId,
            subjectId: session.morningSubjectId!,
            examDate,
            score: participant.totalScore,
            ...getIsoWeekInfo(session.examDate),
            recordedById: actor.id,
          })),
        });
      }
      return importResult(session, assembly.participants.length);
    },
    { timeout: 30000 },
  );
}
async function confirmMock(
  slug: string,
  actor: ImportActor,
  files: ExamImportFiles,
  selection: ExamImportSelection,
) {
  const { updateMockState } = await import("@/lib/mock-store");
  const parsed = parse(files);
  return updateMockState((state) => {
    const source = loadMock(state, slug);
    authorize(actor, source.divisionId);
    const assembly = assemble(source, parsed, selection);
    validateConfirmation(assembly, selection);
    const session = sessionRecord(source, assembly, actor, selection);
    const priorIds = new Set(
      source.sessions
        .filter(
          (row) =>
            row.examTypeId === session.examTypeId &&
            row.identityKey === session.identityKey,
        )
        .map((row) => row.id),
    );
    state.examSessionsByDivision[slug] = [
      ...state.examSessionsByDivision[slug].filter(
        (row) => !priorIds.has(row.id),
      ),
      session,
    ];
    state.examSessionItemsByDivision[slug] = [
      ...state.examSessionItemsByDivision[slug].filter(
        (row) => !priorIds.has(row.sessionId),
      ),
      ...assembly.items.map((item) => ({
        ...item,
        id: randomUUID(),
        divisionId: source.divisionId,
        sessionId: session.id,
      })),
    ];
    state.examSessionParticipantsByDivision[slug] = [
      ...state.examSessionParticipantsByDivision[slug].filter(
        (row) => !priorIds.has(row.sessionId),
      ),
      ...assembly.participants.map((participant) => ({
        ...participantRecord(participant),
        id: randomUUID(),
        divisionId: source.divisionId,
        sessionId: session.id,
      })),
    ];
    state.examItemResponsesByDivision[slug] = [
      ...state.examItemResponsesByDivision[slug].filter(
        (row) => !priorIds.has(row.sessionId),
      ),
      ...assembly.participants.flatMap((participant) =>
        participant.responses.map((response) => ({
          ...response,
          id: randomUUID(),
          divisionId: source.divisionId,
          sessionId: session.id,
          studentId: participant.studentId,
        })),
      ),
    ];
    if (selection.category === "REGULAR") {
      state.examScoresByDivision[slug] = [
        ...state.examScoresByDivision[slug].filter(
          (row) =>
            row.examTypeId !== session.examTypeId ||
            row.examRound !== session.examRound,
        ),
        ...assembly.participants.map((participant) => ({
          id: randomUUID(),
          studentId: participant.studentId,
          examTypeId: session.examTypeId,
          examRound: session.examRound!,
          examDate: session.examDate,
          scores: participant.subjectScores,
          totalScore: participant.totalScore,
          rankInClass:
            1 +
            assembly.participants.filter(
              (other) => other.totalScore > participant.totalScore,
            ).length,
          notes: null,
          recordedById: actor.id,
          createdAt: session.importedAt,
          updatedAt: session.importedAt,
        })),
      ];
    } else {
      state.morningExamScoresByDivision[slug] = [
        ...state.morningExamScoresByDivision[slug].filter(
          (row) =>
            row.examTypeId !== session.examTypeId ||
            row.subjectId !== session.morningSubjectId ||
            row.examDate !== session.examDate,
        ),
        ...assembly.participants.map((participant) => ({
          id: randomUUID(),
          studentId: participant.studentId,
          examTypeId: session.examTypeId,
          subjectId: session.morningSubjectId!,
          examDate: session.examDate,
          score: participant.totalScore,
          ...getIsoWeekInfo(session.examDate),
          notes: null,
          recordedById: actor.id,
          createdAt: session.importedAt,
          updatedAt: session.importedAt,
        })),
      ];
    }
    return importResult(session, assembly.participants.length);
  });
}
