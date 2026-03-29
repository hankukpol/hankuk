import { isMockMode } from "@/lib/mock-data";
import { badRequest, notFound } from "@/lib/errors";
import {
  readMockState,
  updateMockState,
  type MockExamScoreRecord,
  type MockScoreTargetRecord,
} from "@/lib/mock-store";
import type { ScoreTargetUpsertInput } from "@/lib/score-target-schemas";
import {
  isPrismaSchemaMismatchError,
  logSchemaCompatibilityFallback,
} from "@/lib/service-helpers";
import { listExamTypes, type ExamTypeItem } from "@/lib/services/exam.service";
import { listStudents } from "@/lib/services/student.service";

type StudentSummary = {
  id: string;
  divisionId: string;
  studyTrack: string | null;
};

type ScoreTargetRecord = {
  id: string;
  studentId: string;
  examTypeId: string;
  targetScore: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ExamScoreSummaryRecord = {
  examTypeId: string;
  totalScore: number | null;
  examRound: number;
  examDate: Date | null;
  createdAt: Date;
};

type PrismaScoreTargetClient = {
  student: {
    findFirst(args: unknown): Promise<StudentSummary | null>;
  };
  examScore: {
    findMany(args: unknown): Promise<ExamScoreSummaryRecord[]>;
  };
  scoreTarget: {
    findMany(args: unknown): Promise<ScoreTargetRecord[]>;
    upsert(args: unknown): Promise<{ id: string }>;
    findFirst(args: unknown): Promise<{ id: string } | null>;
    delete(args: unknown): Promise<unknown>;
  };
};

type LatestExamMeta = {
  totalScore: number | null;
  examRound: number | null;
  examDate: string | null;
};

export type ScoreTargetItem = {
  id: string;
  studentId: string;
  examTypeId: string;
  examTypeName: string;
  studyTrack: string | null;
  targetScore: number;
  note: string | null;
  latestScore: number | null;
  latestExamRound: number | null;
  latestExamDate: string | null;
  gapToTarget: number | null;
  isAchieved: boolean;
  createdAt: string;
  updatedAt: string;
};

async function getPrismaClient(): Promise<PrismaScoreTargetClient> {
  const { prisma } = await import("@/lib/prisma");
  return prisma as unknown as PrismaScoreTargetClient;
}

function normalizeNote(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toDateString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function getLatestExamMetaByType(records: MockExamScoreRecord[]) {
  const latestByExamType = new Map<string, LatestExamMeta & { sortKey: string }>();

  for (const record of records) {
    const sortKey = `${record.examDate ?? ""}|${record.updatedAt}`;
    const current = latestByExamType.get(record.examTypeId);

    if (!current || sortKey > current.sortKey) {
      latestByExamType.set(record.examTypeId, {
        totalScore: record.totalScore,
        examRound: record.examRound,
        examDate: record.examDate,
        sortKey,
      });
    }
  }

  return latestByExamType;
}

function serializeScoreTarget(
  target: {
    id: string;
    studentId: string;
    examTypeId: string;
    targetScore: number;
    note: string | null;
    createdAt: string | Date;
    updatedAt: string | Date;
  },
  examType: Pick<ExamTypeItem, "id" | "name" | "studyTrack"> | null,
  latestExam: LatestExamMeta | undefined,
) {
  const latestScore = latestExam?.totalScore ?? null;
  const gapToTarget =
    latestScore === null ? null : Math.max(target.targetScore - latestScore, 0);

  return {
    id: target.id,
    studentId: target.studentId,
    examTypeId: target.examTypeId,
    examTypeName: examType?.name ?? "시험",
    studyTrack: examType?.studyTrack ?? null,
    targetScore: target.targetScore,
    note: target.note ?? null,
    latestScore,
    latestExamRound: latestExam?.examRound ?? null,
    latestExamDate: latestExam?.examDate ?? null,
    gapToTarget,
    isAchieved: latestScore !== null && latestScore >= target.targetScore,
    createdAt: typeof target.createdAt === "string" ? target.createdAt : target.createdAt.toISOString(),
    updatedAt: typeof target.updatedAt === "string" ? target.updatedAt : target.updatedAt.toISOString(),
  } satisfies ScoreTargetItem;
}

async function getStudentSummaryOrThrow(divisionSlug: string, studentId: string): Promise<StudentSummary> {
  if (isMockMode()) {
    const state = await readMockState();
    const student = (state.studentsByDivision[divisionSlug] ?? []).find((item) => item.id === studentId);

    if (!student) {
      throw notFound("학생 정보를 찾을 수 없습니다.");
    }

    return {
      id: student.id,
      divisionId: student.divisionId,
      studyTrack: student.studyTrack ?? null,
    };
  }

  const student = (await listStudents(divisionSlug)).find((item) => item.id === studentId);

  if (!student) {
    throw notFound("학생 정보를 찾을 수 없습니다.");
  }

  return {
    id: student.id,
    divisionId: student.divisionId,
    studyTrack: student.studyTrack,
  };
}

function filterExamTypesForStudent(examTypes: ExamTypeItem[], studentStudyTrack: string | null) {
  return examTypes.filter(
    (examType) => !examType.studyTrack || !studentStudyTrack || examType.studyTrack === studentStudyTrack,
  );
}

async function validateExamTypeForStudent(
  divisionSlug: string,
  student: StudentSummary,
  examTypeId: string,
) {
  const examTypes = await listExamTypes(divisionSlug);
  const examType = examTypes.find((item) => item.id === examTypeId);

  if (!examType) {
    throw notFound("시험 종류를 찾을 수 없습니다.");
  }

  if (student.studyTrack && examType.studyTrack && student.studyTrack !== examType.studyTrack) {
    throw badRequest("학생 직렬과 맞지 않는 시험 종류입니다.");
  }

  return examType;
}

export async function listScoreTargetExamTypes(divisionSlug: string, studentId: string) {
  const student = await getStudentSummaryOrThrow(divisionSlug, studentId);
  const examTypes = await listExamTypes(divisionSlug);
  return filterExamTypesForStudent(examTypes, student.studyTrack);
}

export async function listScoreTargets(
  divisionSlug: string,
  studentId: string,
): Promise<ScoreTargetItem[]> {
  if (isMockMode()) {
    const state = await readMockState();
    const examTypes = await listExamTypes(divisionSlug);
    const examTypeMap = new Map(examTypes.map((examType) => [examType.id, examType]));
    const latestExamByType = getLatestExamMetaByType(
      (state.examScoresByDivision[divisionSlug] ?? []).filter((record) => record.studentId === studentId),
    );

    return (state.scoreTargetsByDivision[divisionSlug] ?? [])
      .filter((target) => target.studentId === studentId)
      .map((target) =>
        serializeScoreTarget(target, examTypeMap.get(target.examTypeId) ?? null, latestExamByType.get(target.examTypeId)),
      )
      .sort((left, right) => left.examTypeName.localeCompare(right.examTypeName, "ko"));
  }

  await getStudentSummaryOrThrow(divisionSlug, studentId);
  const prisma = await getPrismaClient();
  const [examTypes, latestScores] = await Promise.all([
    listExamTypes(divisionSlug),
    prisma.examScore.findMany({
      where: {
        studentId,
        student: {
          division: {
            slug: divisionSlug,
          },
        },
      },
      select: {
        examTypeId: true,
        totalScore: true,
        examRound: true,
        examDate: true,
        createdAt: true,
      },
      orderBy: [{ examDate: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  let targets: ScoreTargetRecord[];

  try {
    targets = await prisma.scoreTarget.findMany({
      where: {
        studentId,
        student: {
          division: {
            slug: divisionSlug,
          },
        },
      },
      select: {
        id: true,
        studentId: true,
        examTypeId: true,
        targetScore: true,
        note: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  } catch (error) {
    if (!isPrismaSchemaMismatchError(error, ["score_targets"])) {
      throw error;
    }

    logSchemaCompatibilityFallback("score-targets:list", error);
    return [];
  }

  const latestByType = new Map<string, LatestExamMeta>();
  for (const record of latestScores) {
    if (!latestByType.has(record.examTypeId)) {
      latestByType.set(record.examTypeId, {
        totalScore: record.totalScore,
        examRound: record.examRound,
        examDate: toDateString(record.examDate),
      });
    }
  }

  const examTypeMap = new Map(examTypes.map((examType) => [examType.id, examType]));
  const displayOrderMap = new Map(examTypes.map((examType) => [examType.id, examType.displayOrder]));

  return [...targets]
    .sort(
      (left, right) =>
        (displayOrderMap.get(left.examTypeId) ?? Number.MAX_SAFE_INTEGER) -
          (displayOrderMap.get(right.examTypeId) ?? Number.MAX_SAFE_INTEGER) ||
        left.createdAt.getTime() - right.createdAt.getTime(),
    )
    .map((target) =>
      serializeScoreTarget(target, examTypeMap.get(target.examTypeId) ?? null, latestByType.get(target.examTypeId)),
    );
}

export async function upsertScoreTarget(
  divisionSlug: string,
  studentId: string,
  input: ScoreTargetUpsertInput,
) {
  const student = await getStudentSummaryOrThrow(divisionSlug, studentId);
  const examType = await validateExamTypeForStudent(divisionSlug, student, input.examTypeId);
  const note = normalizeNote(input.note);

  if (isMockMode()) {
    const targetId = await updateMockState(async (state) => {
      const current = state.scoreTargetsByDivision[divisionSlug] ?? [];
      const existing = current.find(
        (target) => target.studentId === studentId && target.examTypeId === input.examTypeId,
      );
      const now = new Date().toISOString();
      const nextTarget: MockScoreTargetRecord = {
        id: existing?.id ?? `mock-score-target-${divisionSlug}-${studentId}-${input.examTypeId}`,
        studentId,
        examTypeId: examType.id,
        targetScore: input.targetScore,
        note,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      state.scoreTargetsByDivision[divisionSlug] = [
        ...current.filter((target) => target.id !== nextTarget.id),
        nextTarget,
      ];

      return nextTarget.id;
    });

    return (await listScoreTargets(divisionSlug, studentId)).find((target) => target.id === targetId) ?? null;
  }

  const prisma = await getPrismaClient();
  const target = await prisma.scoreTarget.upsert({
    where: {
      studentId_examTypeId: {
        studentId,
        examTypeId: examType.id,
      },
    },
    update: {
      targetScore: input.targetScore,
      note,
    },
    create: {
      studentId,
      examTypeId: examType.id,
      targetScore: input.targetScore,
      note,
    },
  });

  return (await listScoreTargets(divisionSlug, studentId)).find((item) => item.id === target.id) ?? null;
}

export async function deleteScoreTarget(
  divisionSlug: string,
  studentId: string,
  targetId: string,
) {
  await getStudentSummaryOrThrow(divisionSlug, studentId);

  if (isMockMode()) {
    await updateMockState(async (state) => {
      const current = state.scoreTargetsByDivision[divisionSlug] ?? [];
      const target = current.find((item) => item.id === targetId && item.studentId === studentId);

      if (!target) {
        throw notFound("성적 목표를 찾을 수 없습니다.");
      }

      state.scoreTargetsByDivision[divisionSlug] = current.filter((item) => item.id !== targetId);
    });

    return;
  }

  const prisma = await getPrismaClient();
  const target = await prisma.scoreTarget.findFirst({
    where: {
      id: targetId,
      studentId,
      student: {
        division: {
          slug: divisionSlug,
        },
      },
    },
    select: {
      id: true,
    },
  });

  if (!target) {
    throw notFound("성적 목표를 찾을 수 없습니다.");
  }

  await prisma.scoreTarget.delete({
    where: {
      id: target.id,
    },
  });
}
