import { randomUUID } from "node:crypto";
import { revalidateTag } from "next/cache";
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
import { buildExamSessionIdentity, getLegacyExamDateKey } from "@/lib/exam-session-identity";
import { badRequest, conflict, forbidden, notFound } from "@/lib/errors";
import { isMockMode } from "@/lib/mock-data";
import {
  getDivisionBySlugOrThrow,
  getPrismaClient,
} from "@/lib/service-helpers";
import { getIsoWeekInfo } from "@/lib/services/morning-exam.service";
import type { MockExamSessionRecord } from "@/lib/mock-store";

import {
  assembleExamImportHistory, derivedScoreSnapshot, examDateString,
  planExamImportDeletion, scoreBelongsToSession,
  type DerivedScore, type HistorySession,
} from "@/lib/exam-import-history";

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
function parse(files: ExamImportFiles, students: ImportStudent[]) {
  try {
    return parseExamImportPair(files.scoreBuffer, files.analysisBuffer, students);
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
    primarySubjectId: assembly.primarySubjectId,
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
    (selection.category === "REGULAR" || result.primarySubjectId)
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
          examDateString(row.examDate) === result.preview.examDate &&
          (selection.category === "REGULAR"
            ? row.subjectId === undefined
            : row.subjectId === result.primarySubjectId),
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
      select: { examTypeId: true, examDate: true },
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
  const prisma = await getPrismaClient();
  const source = await loadDb(prisma, division.id);
  return assemble(source, parse(files, source.students), selection).preview;
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
  return assemble(source, parse(files, source.students), selection).preview;
}
function validateConfirmation(
  assembly: ImportAssembly,
  selection: ExamImportSelection,
) {
  if (!selection.examTypeId)
    throw badRequest("시험 종류를 확인해주세요.");
  if (selection.category === "MORNING" && !selection.topic?.trim())
    throw badRequest("진도 라벨을 입력해주세요.");
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
    primarySubjectId: assembly.primarySubjectId,
    examDate: assembly.preview.examDate,
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
    subjectId: session.primarySubjectId,
    importedCount: count,
    examDate: session.examDate,
    examTypeId: session.examTypeId,
  };
}
// Generate IDs and timestamps once, then persist exactly this record and its proof.
function derivedRecords(session: MockExamSessionRecord, assembly: ImportAssembly, actor: ImportActor): DerivedScore[] {
  return assembly.participants.map((participant) => ({
    id: randomUUID(), studentId: participant.studentId, examTypeId: session.examTypeId,
    examDate: session.examDate, notes: null, recordedById: actor.id,
    createdAt: session.importedAt, updatedAt: session.importedAt,
    ...(session.primarySubjectId === null ? {
      examRound: getLegacyExamDateKey(session.examDate), scores: participant.subjectScores,
      totalScore: participant.totalScore,
      rankInClass: 1 + assembly.participants.filter((other) => other.totalScore > participant.totalScore).length,
    } : {
      subjectId: session.primarySubjectId, score: participant.totalScore,
      ...getIsoWeekInfo(session.examDate),
    }),
  }));
}
// updatedAt 은 두 테이블 모두에 있어야 한다. 가져온 성적을 지울 때
// planExamImportDeletion 이 이 값을 "사람이 손대지 않았다"는 증거로 쓴다.
function dbDerivedBase(row: DerivedScore) {
  return {
    id: row.id, studentId: row.studentId, examTypeId: row.examTypeId,
    examDate: new Date(`${examDateString(row.examDate)}T00:00:00Z`),
    notes: row.notes, recordedById: row.recordedById,
    createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt!),
  };
}
function regularDbRecord(row: DerivedScore): Prisma.ExamScoreCreateManyInput {
  return {
    ...dbDerivedBase(row), examRound: row.examRound!,
    scores: row.scores as Prisma.InputJsonValue,
    totalScore: row.totalScore, rankInClass: row.rankInClass,
  };
}
function morningDbRecord(row: DerivedScore): Prisma.MorningExamScoreCreateManyInput {
  return {
    ...dbDerivedBase(row), subjectId: row.subjectId!, score: row.score,
    weekNumber: row.weekNumber!, weekYear: row.weekYear!,
  };
}
function legacyScope(divisionId: string, session: HistorySession) {
  return {
    examType: { divisionId }, student: { divisionId }, examTypeId: session.examTypeId,
    examDate: new Date(`${examDateString(session.examDate)}T00:00:00Z`),
    ...(session.primarySubjectId === null ? {} : { subjectId: session.primarySubjectId }),
  };
}

export async function confirmExamImport(
  slug: string,
  actor: ImportActor,
  files: ExamImportFiles,
  selection: ExamImportSelection,
): Promise<ExamImportResult> {
  if (isMockMode()) {
    const result = await confirmMock(slug, actor, files, selection);
    revalidateTag(`exam-analysis:${slug}`);
    return result;
  }
  const division = await getDivisionBySlugOrThrow(slug);
  authorize(actor, division.id);
  const prisma = await getPrismaClient();
  const result = await prisma.$transaction(
    async (tx) => {
      // Serialize import/replacement on this tenant's exam type, including first-time imports.
      await tx.$queryRaw`SELECT id FROM study_hall.exam_types WHERE id = ${selection.examTypeId ?? ""} AND division_id = ${division.id} FOR UPDATE`;
      const source = await loadDb(tx, division.id);
      const assembly = assemble(source, parse(files, source.students), selection);
      validateConfirmation(assembly, selection);
      const session = sessionRecord(source, assembly, actor, selection);
      const derived = derivedRecords(session, assembly, actor);
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
          derivedScoreId: derived.find((row) => row.studentId === participant.studentId)!.id,
          derivedScoreSnapshot: derivedScoreSnapshot(derived.find((row) => row.studentId === participant.studentId)!) as Prisma.InputJsonObject,
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
      const scope = legacyScope(division.id, session);
      if (selection.category === "REGULAR") {
        await tx.examScore.deleteMany({ where: scope });
        await tx.examScore.createMany({ data: derived.map(regularDbRecord) });
      } else {
        await tx.morningExamScore.deleteMany({ where: scope });
        await tx.morningExamScore.createMany({ data: derived.map(morningDbRecord) });
      }
      return importResult(session, assembly.participants.length);
    },
    { timeout: 30000 },
  );
  revalidateTag(`exam-analysis:${slug}`);
  return result;
}
async function confirmMock(
  slug: string,
  actor: ImportActor,
  files: ExamImportFiles,
  selection: ExamImportSelection,
) {
  const { updateMockState } = await import("@/lib/mock-store");
  return updateMockState((state) => {
    const source = loadMock(state, slug);
    authorize(actor, source.divisionId);
    const assembly = assemble(source, parse(files, source.students), selection);
    validateConfirmation(assembly, selection);
    const session = sessionRecord(source, assembly, actor, selection);
    const derived = derivedRecords(session, assembly, actor);
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
        derivedScoreId: derived.find((row) => row.studentId === participant.studentId)!.id,
        derivedScoreSnapshot: derivedScoreSnapshot(derived.find((row) => row.studentId === participant.studentId)!),
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
        ...state.examScoresByDivision[slug].filter((row) => !scoreBelongsToSession(row, session)),
        ...derived as typeof state.examScoresByDivision[string],
      ];
    } else {
      state.morningExamScoresByDivision[slug] = [
        ...state.morningExamScoresByDivision[slug].filter((row) => !scoreBelongsToSession(row, session)),
        ...derived as typeof state.morningExamScoresByDivision[string],
      ];
    }
    return importResult(session, assembly.participants.length);
  });
}

export async function listExamImports(slug: string, actor: ImportActor, options: { examTypeId?: string } = {}) {
  if (isMockMode()) {
    const { readMockState } = await import("@/lib/mock-store");
    const state = await readMockState();
    const source = loadMock(state, slug);
    authorize(actor, source.divisionId);
    return assembleExamImportHistory({
      sessions: state.examSessionsByDivision[slug] ?? [],
      participants: state.examSessionParticipantsByDivision[slug] ?? [],
      examTypes: source.examTypes,
      admins: state.admins.filter((row) => row.divisionId === source.divisionId || (row.role === "SUPER_ADMIN" && row.divisionId === null)),
    }, source.divisionId, options);
  }
  const division = await getDivisionBySlugOrThrow(slug);
  authorize(actor, division.id);
  const prisma = await getPrismaClient();
  const [sessions, participants, examTypes, admins] = await Promise.all([
    prisma.examSession.findMany({ where: { divisionId: division.id } }),
    prisma.examSessionParticipant.findMany({ where: { divisionId: division.id }, select: { divisionId: true, sessionId: true, studentId: true } }),
    prisma.examType.findMany({ where: { divisionId: division.id }, include: { subjects: true } }),
    prisma.admin.findMany({
      where: { OR: [{ divisionId: division.id }, { divisionId: null, role: "SUPER_ADMIN" }] },
      select: { id: true, name: true },
    }),
  ]);
  return assembleExamImportHistory({ sessions, participants, examTypes, admins }, division.id, options);
}

/** Scope and compare the entire fingerprint again in DELETE to protect concurrent manual edits. */
async function deleteProvenScore(tx: Prisma.TransactionClient, divisionId: string, session: HistorySession, row: DerivedScore) {
  if (session.primarySubjectId === null) {
    return tx.examScore.deleteMany({ where: {
      ...regularDbRecord(row), ...legacyScope(divisionId, session),
      scores: { equals: row.scores as Prisma.InputJsonValue },
    } });
  }
  return tx.morningExamScore.deleteMany({ where: {
    ...morningDbRecord(row), ...legacyScope(divisionId, session),
  } });
}

export async function deleteExamImport(slug: string, actor: ImportActor, sessionId: string) {
  if (isMockMode()) {
    const result = await deleteMock(slug, actor, sessionId);
    revalidateTag(`exam-analysis:${slug}`);
    return result;
  }
  const division = await getDivisionBySlugOrThrow(slug);
  authorize(actor, division.id);
  const prisma = await getPrismaClient();
  const result = await prisma.$transaction(async (tx) => {
    const where = { divisionId: division.id, id: sessionId };
    const initial = (await tx.examSession.findMany({ where }))[0];
    if (!initial) throw notFound("가져오기 이력을 찾을 수 없습니다.");
    // Same lock as confirm: an overwrite cannot race this session's deletion.
    await tx.$queryRaw`SELECT id FROM study_hall.exam_types WHERE id = ${initial.examTypeId} AND division_id = ${division.id} FOR UPDATE`;
    const session = (await tx.examSession.findMany({ where }))[0];
    if (!session) throw notFound("가져오기 이력을 찾을 수 없습니다.");
    const childScope = { divisionId: division.id, sessionId };
    const participants = await tx.examSessionParticipant.findMany({ where: childScope });
    const scope = legacyScope(division.id, session);
    const legacy = session.primarySubjectId === null
      ? await tx.examScore.findMany({ where: scope })
      : await tx.morningExamScore.findMany({ where: scope });
    const plan = planExamImportDeletion(session, participants, legacy);
    await tx.examItemResponse.deleteMany({ where: childScope });
    await tx.examSessionParticipant.deleteMany({ where: childScope });
    await tx.examSessionItem.deleteMany({ where: childScope });
    let keptManualScores = plan.keptManualScores;
    for (const score of plan.deletable) {
      const deleted = await deleteProvenScore(tx, division.id, session, score);
      if (deleted.count === 0) keptManualScores++;
    }
    await tx.examSession.deleteMany({ where });
    return { removedStudents: plan.removedStudents, keptManualScores };
  }, { timeout: 30000 });
  revalidateTag(`exam-analysis:${slug}`);
  return result;
}

async function deleteMock(slug: string, actor: ImportActor, sessionId: string) {
  const { updateMockState } = await import("@/lib/mock-store");
  return updateMockState((state) => {
    const source = loadMock(state, slug);
    authorize(actor, source.divisionId);
    const session = (state.examSessionsByDivision[slug] ?? []).find((row) => row.id === sessionId && row.divisionId === source.divisionId);
    if (!session) throw notFound("가져오기 이력을 찾을 수 없습니다.");
    const owned = (row: { sessionId: string; divisionId: string }) => row.sessionId === sessionId && row.divisionId === source.divisionId;
    const participants = (state.examSessionParticipantsByDivision[slug] ?? []).filter(owned);
    const legacy = session.primarySubjectId === null ? state.examScoresByDivision[slug] ?? [] : state.morningExamScoresByDivision[slug] ?? [];
    // Mirror the DB's student/exam-type tenant joins, even for malformed mock state.
    const studentIds = new Set(source.students.map((row) => row.id));
    const typeIds = new Set(source.examTypes.map((row) => row.id));
    const plan = planExamImportDeletion(session, participants, legacy.filter((row) => studentIds.has(row.studentId) && typeIds.has(row.examTypeId)));
    const removedIds = new Set(plan.deletable.map((row) => row.id));
    state.examItemResponsesByDivision[slug] = (state.examItemResponsesByDivision[slug] ?? []).filter((row) => !owned(row));
    state.examSessionParticipantsByDivision[slug] = (state.examSessionParticipantsByDivision[slug] ?? []).filter((row) => !owned(row));
    state.examSessionItemsByDivision[slug] = (state.examSessionItemsByDivision[slug] ?? []).filter((row) => !owned(row));
    if (session.primarySubjectId === null)
      state.examScoresByDivision[slug] = (state.examScoresByDivision[slug] ?? []).filter((row) => !removedIds.has(row.id));
    else
      state.morningExamScoresByDivision[slug] = (state.morningExamScoresByDivision[slug] ?? []).filter((row) => !removedIds.has(row.id));
    state.examSessionsByDivision[slug] = (state.examSessionsByDivision[slug] ?? []).filter((row) => row.id !== sessionId || row.divisionId !== source.divisionId);
    return { removedStudents: plan.removedStudents, keptManualScores: plan.keptManualScores };
  });
}
