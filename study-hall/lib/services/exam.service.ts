import { getMockDivisionBySlug, isMockMode } from "@/lib/mock-data";
import { notFound } from "@/lib/errors";
import {
  readMockState,
  updateMockState,
  type MockExamScoreRecord,
  type MockExamSubjectRecord,
  type MockExamTypeRecord,
} from "@/lib/mock-store";
import type {
  ExamScoresBatchSchemaInput,
  ExamTypeSchemaInput,
} from "@/lib/exam-schemas";
import {
  isPrismaSchemaMismatchError,
  logSchemaCompatibilityFallback,
} from "@/lib/service-helpers";
import { listStudents } from "@/lib/services/student.service";

type ExamActor = {
  id: string;
  role: "SUPER_ADMIN" | "ADMIN" | "ASSISTANT";
};

export type ExamSubjectItem = {
  id: string;
  examTypeId: string;
  name: string;
  totalItems: number | null;
  pointsPerItem: number | null;
  maxScore: number | null;
  displayOrder: number;
  isActive: boolean;
};

export type ExamTypeItem = {
  id: string;
  divisionId: string;
  name: string;
  category: "MORNING" | "REGULAR";
  studyTrack: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  subjects: ExamSubjectItem[];
};

export type ExamScoreSheetRow = {
  studentId: string;
  studentName: string;
  studentNumber: string;
  scores: Record<string, number | null>;
  totalScore: number | null;
  rankInClass: number | null;
  notes: string | null;
};

export type ExamScoreSheet = {
  examTypeId: string;
  examTypeName: string;
  studyTrack: string | null;
  examRound: number;
  examDate: string | null;
  subjects: ExamSubjectItem[];
  rows: ExamScoreSheetRow[];
};

export type LatestExamSummary = {
  id: string;
  examTypeName: string;
  examRound: number;
  examDate: string | null;
  totalScore: number | null;
  rankInClass: number | null;
  notes: string | null;
};

export type StudentExamResultItem = {
  id: string;
  examTypeId: string;
  examTypeName: string;
  examRound: number;
  examDate: string | null;
  totalScore: number | null;
  rankInClass: number | null;
  notes: string | null;
  subjects: Array<{
    subjectId: string;
    name: string;
    totalItems: number | null;
    pointsPerItem: number | null;
    maxScore: number | null;
    score: number | null;
  }>;
};

type LegacyExamTypeRow = {
  id: string;
  divisionId: string;
  name: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  subjectId: string | null;
  subjectName: string | null;
  subjectTotalItems: number | null;
  subjectDisplayOrder: number | null;
  subjectIsActive: boolean | null;
};

function normalizeText(value: string) {
  return value.trim();
}

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeTotalItems(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizePointsPerItem(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeExamDate(value?: string | null) {
  return value ?? null;
}

function calculateSubjectMaxScore(totalItems: number | null, pointsPerItem: number | null) {
  if (typeof totalItems !== "number" || typeof pointsPerItem !== "number") {
    return null;
  }

  return totalItems * pointsPerItem;
}

function sortSubjects<T extends { displayOrder: number }>(subjects: T[]) {
  return [...subjects].sort((left, right) => left.displayOrder - right.displayOrder);
}

function sortExamTypes<T extends { displayOrder: number }>(examTypes: T[]) {
  return [...examTypes].sort((left, right) => left.displayOrder - right.displayOrder);
}

function toSubjectItem(subject: {
  id: string;
  examTypeId: string;
  name: string;
  totalItems: number | null;
  pointsPerItem?: number | null;
  displayOrder: number;
  isActive: boolean;
}) {
  return {
    id: subject.id,
    examTypeId: subject.examTypeId,
    name: subject.name,
    totalItems: subject.totalItems,
    pointsPerItem: subject.pointsPerItem ?? null,
    maxScore: calculateSubjectMaxScore(subject.totalItems, subject.pointsPerItem ?? null),
    displayOrder: subject.displayOrder,
    isActive: subject.isActive,
  } satisfies ExamSubjectItem;
}

function toExamTypeItem(examType: {
  id: string;
  divisionId: string;
  name: string;
  category?: "MORNING" | "REGULAR" | string;
  studyTrack?: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string | Date;
  updatedAt?: string | Date;
  subjects: Array<{
    id: string;
    examTypeId: string;
    name: string;
    totalItems: number | null;
    pointsPerItem?: number | null;
    displayOrder: number;
    isActive: boolean;
  }>;
}) {
  return {
    id: examType.id,
    divisionId: examType.divisionId,
    name: examType.name,
    category: (examType.category === "MORNING" ? "MORNING" : "REGULAR") as "MORNING" | "REGULAR",
    studyTrack: examType.studyTrack ?? null,
    isActive: examType.isActive,
    displayOrder: examType.displayOrder,
    createdAt:
      typeof examType.createdAt === "string"
        ? examType.createdAt
        : examType.createdAt.toISOString(),
    updatedAt:
      typeof examType.updatedAt === "string"
        ? examType.updatedAt
        : examType.updatedAt instanceof Date
          ? examType.updatedAt.toISOString()
          : typeof examType.createdAt === "string"
            ? examType.createdAt
            : examType.createdAt.toISOString(),
    subjects: sortSubjects(examType.subjects).map((subject) => toSubjectItem(subject)),
  } satisfies ExamTypeItem;
}

async function readLegacyExamTypes(
  prisma: { $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> },
  divisionSlug: string,
): Promise<ExamTypeItem[]> {
  const rows = await prisma.$queryRaw<LegacyExamTypeRow[]>`
    SELECT
      et.id,
      et.division_id AS "divisionId",
      et.name,
      et.is_active AS "isActive",
      et.display_order AS "displayOrder",
      et.created_at AS "createdAt",
      es.id AS "subjectId",
      es.name AS "subjectName",
      es.total_items AS "subjectTotalItems",
      es.display_order AS "subjectDisplayOrder",
      es.is_active AS "subjectIsActive"
    FROM exam_types et
    JOIN divisions d
      ON d.id = et.division_id
    LEFT JOIN exam_subjects es
      ON es.exam_type_id = et.id
    WHERE d.slug = ${divisionSlug}
    ORDER BY et.display_order ASC, es.display_order ASC
  `;

  const examTypes = new Map<
    string,
    {
      id: string;
      divisionId: string;
      name: string;
      category: "REGULAR";
      studyTrack: null;
      isActive: boolean;
      displayOrder: number;
      createdAt: Date;
      updatedAt: Date;
      subjects: Array<{
        id: string;
        examTypeId: string;
        name: string;
        totalItems: number | null;
        pointsPerItem: null;
        displayOrder: number;
        isActive: boolean;
      }>;
    }
  >();

  for (const row of rows) {
    const current =
      examTypes.get(row.id) ??
      {
        id: row.id,
        divisionId: row.divisionId,
        name: row.name,
        category: "REGULAR" as const,
        studyTrack: null,
        isActive: row.isActive,
        displayOrder: row.displayOrder,
        createdAt: row.createdAt,
        updatedAt: row.createdAt,
        subjects: [],
      };

    if (row.subjectId) {
      current.subjects.push({
        id: row.subjectId,
        examTypeId: row.id,
        name: row.subjectName ?? "",
        totalItems: row.subjectTotalItems,
        pointsPerItem: null,
        displayOrder: row.subjectDisplayOrder ?? current.subjects.length,
        isActive: row.subjectIsActive ?? true,
      });
    }

    examTypes.set(row.id, current);
  }

  return sortExamTypes(Array.from(examTypes.values())).map((examType) => toExamTypeItem(examType));
}

function toUtcDate(date: string | null) {
  if (!date) {
    return null;
  }

  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function sumScores(scores: Record<string, number | null>) {
  const numericScores = Object.values(scores).filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );

  return numericScores.length > 0 ? numericScores.reduce((sum, value) => sum + value, 0) : null;
}

function assignRanks<T extends { totalScore: number | null }>(rows: T[]) {
  const sorted = [...rows].sort((left, right) => (right.totalScore ?? -1) - (left.totalScore ?? -1));
  const rankByScore = new Map<number, number>();

  sorted.forEach((row, index) => {
    if (row.totalScore === null || rankByScore.has(row.totalScore)) {
      return;
    }

    rankByScore.set(row.totalScore, index + 1);
  });

  return rows.map((row) => ({
    ...row,
    rankInClass: row.totalScore === null ? null : rankByScore.get(row.totalScore) ?? null,
  }));
}

async function getDivisionOrThrow(divisionSlug: string) {
  const { prisma } = await import("@/lib/prisma");

  const division = await prisma.division.findUnique({
    where: {
      slug: divisionSlug,
    },
  });

  if (!division) {
    throw notFound("지점 정보를 찾을 수 없습니다.");
  }

  return division;
}

async function getExamTypeOrThrow(divisionSlug: string, examTypeId: string) {
  const examTypes = await listExamTypes(divisionSlug);
  const examType = examTypes.find((item) => item.id === examTypeId);

  if (!examType) {
    throw notFound("시험 종류를 찾을 수 없습니다.");
  }

  return examType;
}

function isStudentEligibleForExam(
  student: { studyTrack: string | null; status: string },
  studyTrack: string | null,
) {
  const isActiveStudent = student.status === "ACTIVE" || student.status === "ON_LEAVE";

  if (!isActiveStudent) {
    return false;
  }

  if (!studyTrack) {
    return true;
  }

  return student.studyTrack === studyTrack;
}

function buildSubjectPayload(
  divisionSlug: string,
  examTypeId: string,
  subjects: ExamTypeSchemaInput["subjects"],
  existingSubjects: MockExamSubjectRecord[] = [],
) {
  const now = new Date().toISOString();
  const existingById = new Map(existingSubjects.map((subject) => [subject.id, subject]));
  const nextSubjects = subjects.map((subject, index) => {
    const existing = subject.id ? existingById.get(subject.id) : null;

    return {
      id: existing?.id ?? `mock-exam-subject-${divisionSlug}-${Date.now()}-${index}`,
      examTypeId,
      name: normalizeText(subject.name),
      totalItems: normalizeTotalItems(subject.totalItems),
      pointsPerItem: normalizePointsPerItem(subject.pointsPerItem),
      displayOrder: index,
      isActive: subject.isActive ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } satisfies MockExamSubjectRecord;
  });

  const archivedSubjects = existingSubjects
    .filter((subject) => !subjects.some((candidate) => candidate.id === subject.id))
    .map((subject, index) => ({
      ...subject,
      isActive: false,
      displayOrder: nextSubjects.length + index,
      updatedAt: now,
    }));

  return [...nextSubjects, ...archivedSubjects];
}

function normalizeScoreMap(subjects: ExamSubjectItem[], scores: Record<string, number | null>) {
  return Object.fromEntries(
    subjects.map((subject) => {
      const value = scores[subject.id];
      return [subject.id, typeof value === "number" && Number.isFinite(value) ? value : null];
    }),
  );
}

export async function listExamTypes(divisionSlug: string) {
  if (isMockMode()) {
    const state = await readMockState();
    return sortExamTypes(state.examTypesByDivision[divisionSlug] ?? []).map((examType) =>
      toExamTypeItem(examType),
    );
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const { prisma } = await import("@/lib/prisma");

  try {
    const examTypes = await prisma.examType.findMany({
      where: {
        divisionId: division.id,
      },
      include: {
        subjects: true,
      },
      orderBy: {
        displayOrder: "asc",
      },
    });

    return examTypes.map((examType) => toExamTypeItem(examType));
  } catch (error) {
    if (
      !isPrismaSchemaMismatchError(error, [
        "exam_types",
        "exam_subjects",
        "category",
        "study_track",
        "points_per_item",
      ])
    ) {
      throw error;
    }

    logSchemaCompatibilityFallback("exam-types:list", error);
    return readLegacyExamTypes(prisma, divisionSlug);
  }
}

export async function createExamType(divisionSlug: string, input: ExamTypeSchemaInput) {
  const name = normalizeText(input.name);
  const studyTrack = normalizeOptionalText(input.studyTrack);

  if (isMockMode()) {
    const nextExamType = await updateMockState((state) => {
      const division = getMockDivisionBySlug(divisionSlug);

      if (!division) {
        throw new Error("지점 정보를 찾을 수 없습니다.");
      }

      const current = state.examTypesByDivision[divisionSlug] ?? [];
      const now = new Date().toISOString();
      const examTypeId = `mock-exam-type-${divisionSlug}-${Date.now()}`;
      const record: MockExamTypeRecord = {
        id: examTypeId,
        divisionId: division.id,
        name,
        category: input.category === "MORNING" ? "MORNING" : "REGULAR",
        studyTrack,
        isActive: input.isActive ?? true,
        displayOrder: current.length,
        createdAt: now,
        updatedAt: now,
        subjects: buildSubjectPayload(divisionSlug, examTypeId, input.subjects),
      };

      state.examTypesByDivision[divisionSlug] = [...current, record];
      return record;
    });

    return toExamTypeItem(nextExamType);
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const { prisma } = await import("@/lib/prisma");

  const count = await prisma.examType.count({
    where: {
      divisionId: division.id,
    },
  });

  const examType = await prisma.examType.create({
    data: {
      divisionId: division.id,
      name,
      category: input.category === "MORNING" ? "MORNING" : "REGULAR",
      studyTrack,
      isActive: input.isActive ?? true,
      displayOrder: count,
      subjects: {
        create: input.subjects.map((subject, index) => ({
          name: normalizeText(subject.name),
          totalItems: normalizeTotalItems(subject.totalItems),
          pointsPerItem: normalizePointsPerItem(subject.pointsPerItem),
          isActive: subject.isActive ?? true,
          displayOrder: index,
        })),
      },
    },
    include: {
      subjects: true,
    },
  });

  return toExamTypeItem(examType);
}

export async function updateExamType(
  divisionSlug: string,
  examTypeId: string,
  input: ExamTypeSchemaInput,
) {
  const name = normalizeText(input.name);
  const studyTrack = normalizeOptionalText(input.studyTrack);

  if (isMockMode()) {
    const updated = await updateMockState((state) => {
      const current = state.examTypesByDivision[divisionSlug] ?? [];
      const target = current.find((examType) => examType.id === examTypeId);

      if (!target) {
        throw notFound("시험 종류를 찾을 수 없습니다.");
      }

      const updatedTypes = current.map((examType) =>
        examType.id === examTypeId
          ? {
              ...examType,
              name,
              studyTrack,
              isActive: input.isActive ?? examType.isActive,
              updatedAt: new Date().toISOString(),
              subjects: buildSubjectPayload(divisionSlug, examTypeId, input.subjects, examType.subjects),
            }
          : examType,
      );

      state.examTypesByDivision[divisionSlug] = updatedTypes;
      const next = updatedTypes.find((examType) => examType.id === examTypeId);

      if (!next) {
        throw new Error("시험 종류를 찾을 수 없습니다.");
      }

      return next;
    });

    return toExamTypeItem(updated);
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const { prisma } = await import("@/lib/prisma");

  const examType = await prisma.examType.findFirst({
    where: {
      id: examTypeId,
      divisionId: division.id,
    },
    include: {
      subjects: true,
    },
  });

  if (!examType) {
    throw notFound("시험 종류를 찾을 수 없습니다.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.examType.update({
      where: {
        id: examTypeId,
      },
      data: {
        name,
        studyTrack,
        isActive: input.isActive ?? examType.isActive,
      },
    });

    const existingSubjects = examType.subjects;
    const inputIds = new Set(input.subjects.map((subject) => subject.id).filter(Boolean));

    for (let index = 0; index < input.subjects.length; index += 1) {
      const subject = input.subjects[index];

      if (subject.id && existingSubjects.some((item) => item.id === subject.id)) {
        await tx.examSubject.update({
          where: {
            id: subject.id,
          },
          data: {
            name: normalizeText(subject.name),
            totalItems: normalizeTotalItems(subject.totalItems),
            pointsPerItem: normalizePointsPerItem(subject.pointsPerItem),
            isActive: subject.isActive ?? true,
            displayOrder: index,
          },
        });
      } else {
        await tx.examSubject.create({
          data: {
            examTypeId,
            name: normalizeText(subject.name),
            totalItems: normalizeTotalItems(subject.totalItems),
            pointsPerItem: normalizePointsPerItem(subject.pointsPerItem),
            isActive: subject.isActive ?? true,
            displayOrder: index,
          },
        });
      }
    }

    const archivedSubjects = existingSubjects.filter((subject) => !inputIds.has(subject.id));

    for (let index = 0; index < archivedSubjects.length; index += 1) {
      const subject = archivedSubjects[index];

      await tx.examSubject.update({
        where: {
          id: subject.id,
        },
        data: {
          isActive: false,
          displayOrder: input.subjects.length + index,
        },
      });
    }
  });

  const updated = await prisma.examType.findUnique({
    where: {
      id: examTypeId,
    },
    include: {
      subjects: true,
    },
  });

  if (!updated) {
    throw new Error("시험 종류를 찾을 수 없습니다.");
  }

  return toExamTypeItem(updated);
}

export async function deleteExamType(divisionSlug: string, examTypeId: string) {
  if (isMockMode()) {
    await updateMockState((state) => {
      const current = state.examTypesByDivision[divisionSlug] ?? [];

      if (!current.some((examType) => examType.id === examTypeId)) {
        throw new Error("시험 종류를 찾을 수 없습니다.");
      }

      // 성적 데이터가 존재하면 삭제 차단
      const hasRegularScores = (state.examScoresByDivision[divisionSlug] ?? []).some(
        (score) => score.examTypeId === examTypeId,
      );
      const hasMorningScores = (state.morningExamScoresByDivision[divisionSlug] ?? []).some(
        (score) => score.examTypeId === examTypeId,
      );
      if (hasRegularScores || hasMorningScores) {
        throw new Error("해당 시험 종류에 성적 데이터가 존재하여 삭제할 수 없습니다. 먼저 성적 데이터를 삭제해주세요.");
      }

      state.examTypesByDivision[divisionSlug] = current.filter((examType) => examType.id !== examTypeId);
    });
    return true;
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const { prisma } = await import("@/lib/prisma");

  const examType = await prisma.examType.findFirst({
    where: {
      id: examTypeId,
      divisionId: division.id,
    },
    select: {
      id: true,
    },
  });

  if (!examType) {
    throw new Error("시험 종류를 찾을 수 없습니다.");
  }

  // 성적 데이터가 존재하면 삭제 차단
  const [regularScoreCount, morningScoreCount] = await Promise.all([
    prisma.examScore.count({ where: { examTypeId } }),
    prisma.morningExamScore.count({ where: { examTypeId } }),
  ]);

  if (regularScoreCount > 0 || morningScoreCount > 0) {
    throw new Error("해당 시험 종류에 성적 데이터가 존재하여 삭제할 수 없습니다. 먼저 성적 데이터를 삭제해주세요.");
  }

  await prisma.examType.delete({
    where: {
      id: examTypeId,
    },
  });

  return true;
}

export async function getExamScoreSheet(
  divisionSlug: string,
  examTypeId: string,
  examRound: number,
) {
  const examType = await getExamTypeOrThrow(divisionSlug, examTypeId);
  const subjects = sortSubjects(examType.subjects).filter((subject) => subject.isActive);
  const students = (await listStudents(divisionSlug)).filter((student) =>
    isStudentEligibleForExam(student, examType.studyTrack),
  );

  if (isMockMode()) {
    const state = await readMockState();
    const records = (state.examScoresByDivision[divisionSlug] ?? []).filter(
      (score) => score.examTypeId === examTypeId && score.examRound === examRound,
    );
    const recordMap = new Map(records.map((record) => [record.studentId, record]));

    return {
      examTypeId: examType.id,
      examTypeName: examType.name,
      studyTrack: examType.studyTrack,
      examRound,
      examDate: records[0]?.examDate ?? null,
      subjects,
      rows: students.map((student) => {
        const record = recordMap.get(student.id);
        const scores = normalizeScoreMap(subjects, record?.scores ?? {});

        return {
          studentId: student.id,
          studentName: student.name,
          studentNumber: student.studentNumber,
          scores,
          totalScore: record?.totalScore ?? sumScores(scores),
          rankInClass: record?.rankInClass ?? null,
          notes: record?.notes ?? null,
        } satisfies ExamScoreSheetRow;
      }),
    } satisfies ExamScoreSheet;
  }

  const { prisma } = await import("@/lib/prisma");

  const records = await prisma.examScore.findMany({
    where: {
      examTypeId,
      examRound,
      student: {
        division: {
          slug: divisionSlug,
        },
      },
    },
    select: {
      studentId: true,
      examDate: true,
      scores: true,
      totalScore: true,
      rankInClass: true,
      notes: true,
    },
  });
  const recordMap = new Map(records.map((record) => [record.studentId, record]));

  return {
    examTypeId: examType.id,
    examTypeName: examType.name,
    studyTrack: examType.studyTrack,
    examRound,
    examDate: toDateString(records[0]?.examDate ?? null),
    subjects,
    rows: students.map((student) => {
      const record = recordMap.get(student.id);
      const rawScores =
        record?.scores && typeof record.scores === "object" && !Array.isArray(record.scores)
          ? (record.scores as Record<string, unknown>)
          : {};
      const scores = normalizeScoreMap(
        subjects,
        Object.fromEntries(
          Object.entries(rawScores).map(([key, value]) => [
            key,
            typeof value === "number" ? value : null,
          ]),
        ),
      );

      return {
        studentId: student.id,
        studentName: student.name,
        studentNumber: student.studentNumber,
        scores,
        totalScore: record?.totalScore ?? sumScores(scores),
        rankInClass: record?.rankInClass ?? null,
        notes: record?.notes ?? null,
      } satisfies ExamScoreSheetRow;
    }),
  } satisfies ExamScoreSheet;
}

export async function saveExamScores(
  divisionSlug: string,
  actor: ExamActor,
  input: ExamScoresBatchSchemaInput,
) {
  const examType = await getExamTypeOrThrow(divisionSlug, input.examTypeId);
  const subjects = sortSubjects(examType.subjects).filter((subject) => subject.isActive);
  const students = (await listStudents(divisionSlug)).filter((student) =>
    isStudentEligibleForExam(student, examType.studyTrack),
  );
  const studentMap = new Map(students.map((student) => [student.id, student]));
  const now = new Date().toISOString();

  const preparedRows = assignRanks(
    input.rows.map((row) => {
      if (!studentMap.has(row.studentId)) {
        throw notFound("학생 정보를 찾을 수 없습니다.");
      }

      const scores = normalizeScoreMap(subjects, row.scores);

      return {
        studentId: row.studentId,
        scores,
        totalScore: sumScores(scores),
        notes: normalizeOptionalText(row.notes),
      };
    }),
  );

  if (isMockMode()) {
    await updateMockState((state) => {
      const current = state.examScoresByDivision[divisionSlug] ?? [];
      const untouched = current.filter(
        (score) => !(score.examTypeId === input.examTypeId && score.examRound === input.examRound),
      );
      const nextScores = preparedRows.map((row) => {
        const existing = current.find(
          (score) =>
            score.examTypeId === input.examTypeId &&
            score.examRound === input.examRound &&
            score.studentId === row.studentId,
        );

        return {
          id: existing?.id ?? `mock-exam-score-${divisionSlug}-${input.examTypeId}-${input.examRound}-${row.studentId}`,
          studentId: row.studentId,
          examTypeId: input.examTypeId,
          examRound: input.examRound,
          examDate: normalizeExamDate(input.examDate),
          scores: row.scores,
          totalScore: row.totalScore,
          rankInClass: row.rankInClass,
          notes: row.notes,
          recordedById: actor.id,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        } satisfies MockExamScoreRecord;
      });

      state.examScoresByDivision[divisionSlug] = [...untouched, ...nextScores];
    });
    return getExamScoreSheet(divisionSlug, input.examTypeId, input.examRound);
  }

  const division = await getDivisionOrThrow(divisionSlug);
  const { prisma } = await import("@/lib/prisma");

  const studentIds = preparedRows.map((row) => row.studentId);
  const matchingStudents = await prisma.student.findMany({
    where: {
      divisionId: division.id,
      id: {
        in: studentIds,
      },
    },
    select: {
      id: true,
    },
  });

  if (matchingStudents.length !== studentIds.length) {
    throw notFound("학생 정보를 찾을 수 없습니다.");
  }

  await prisma.$transaction(
    preparedRows.map((row) =>
      prisma.examScore.upsert({
        where: {
          studentId_examTypeId_examRound: {
            studentId: row.studentId,
            examTypeId: input.examTypeId,
            examRound: input.examRound,
          },
        },
        update: {
          examDate: toUtcDate(normalizeExamDate(input.examDate)),
          scores: row.scores,
          totalScore: row.totalScore,
          rankInClass: row.rankInClass,
          notes: row.notes,
          recordedById: actor.id,
        },
        create: {
          studentId: row.studentId,
          examTypeId: input.examTypeId,
          examRound: input.examRound,
          examDate: toUtcDate(normalizeExamDate(input.examDate)),
          scores: row.scores,
          totalScore: row.totalScore,
          rankInClass: row.rankInClass,
          notes: row.notes,
          recordedById: actor.id,
        },
      }),
    ),
  );

  return getExamScoreSheet(divisionSlug, input.examTypeId, input.examRound);
}

export async function getLatestExamSummaryForStudent(
  divisionSlug: string,
  studentId: string,
): Promise<LatestExamSummary | null> {
  if (isMockMode()) {
    const state = await readMockState();
    const examTypes = new Map(
      (state.examTypesByDivision[divisionSlug] ?? []).map((examType) => [examType.id, examType]),
    );
    const latest = [...(state.examScoresByDivision[divisionSlug] ?? [])]
      .filter((score) => score.studentId === studentId)
      .sort((left, right) => {
        const leftDate = left.examDate ?? left.updatedAt;
        const rightDate = right.examDate ?? right.updatedAt;
        return rightDate.localeCompare(leftDate);
      })[0];

    if (!latest) {
      return null;
    }

    return {
      id: latest.id,
      examTypeName: examTypes.get(latest.examTypeId)?.name ?? "모의고사",
      examRound: latest.examRound,
      examDate: latest.examDate,
      totalScore: latest.totalScore,
      rankInClass: latest.rankInClass,
      notes: latest.notes,
    };
  }

  const { prisma } = await import("@/lib/prisma");

  const latest = await prisma.examScore.findFirst({
    where: {
      studentId,
      student: {
        division: {
          slug: divisionSlug,
        },
      },
    },
    include: {
      examType: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [{ examDate: "desc" }, { createdAt: "desc" }],
  });

  if (!latest) {
    return null;
  }

  return {
    id: latest.id,
    examTypeName: latest.examType.name,
    examRound: latest.examRound,
    examDate: toDateString(latest.examDate),
    totalScore: latest.totalScore,
    rankInClass: latest.rankInClass,
    notes: latest.notes,
  };
}

export async function getLatestExamSummariesForStudents(
  divisionSlug: string,
  studentIds: string[],
): Promise<Map<string, LatestExamSummary | null>> {
  if (studentIds.length === 0) {
    return new Map();
  }

  if (isMockMode()) {
    const entries = await Promise.all(
      studentIds.map(async (studentId) => [studentId, await getLatestExamSummaryForStudent(divisionSlug, studentId)] as const),
    );

    return new Map(entries);
  }

  const { prisma } = await import("@/lib/prisma");

  const latestScores = await prisma.examScore.findMany({
    where: {
      studentId: { in: studentIds },
      student: {
        division: {
          slug: divisionSlug,
        },
      },
    },
    include: {
      examType: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [{ examDate: "desc" }, { createdAt: "desc" }],
  });

  const summaryMap = new Map<string, LatestExamSummary | null>();

  for (const studentId of studentIds) {
    summaryMap.set(studentId, null);
  }

  for (const score of latestScores) {
    if (summaryMap.get(score.studentId)) {
      continue;
    }

    summaryMap.set(score.studentId, {
      id: score.id,
      examTypeName: score.examType.name,
      examRound: score.examRound,
      examDate: toDateString(score.examDate),
      totalScore: score.totalScore,
      rankInClass: score.rankInClass,
      notes: score.notes,
    });
  }

  return summaryMap;
}

export async function listStudentExamResults(
  divisionSlug: string,
  studentId: string,
): Promise<StudentExamResultItem[]> {
  if (isMockMode()) {
    const state = await readMockState();
    const examTypes = new Map(
      (state.examTypesByDivision[divisionSlug] ?? []).map((examType) => [examType.id, examType]),
    );

    return [...(state.examScoresByDivision[divisionSlug] ?? [])]
      .filter((score) => score.studentId === studentId)
      .sort((left, right) => {
        const leftDate = left.examDate ?? left.updatedAt;
        const rightDate = right.examDate ?? right.updatedAt;
        return rightDate.localeCompare(leftDate);
      })
      .map((score) => {
        const examType = examTypes.get(score.examTypeId);
        const subjects = sortSubjects(examType?.subjects ?? [])
          .filter((subject) => subject.isActive)
          .map((subject) => ({
            subjectId: subject.id,
            name: subject.name,
            totalItems: subject.totalItems,
            pointsPerItem: subject.pointsPerItem ?? null,
            maxScore: calculateSubjectMaxScore(subject.totalItems, subject.pointsPerItem ?? null),
            score: typeof score.scores[subject.id] === "number" ? score.scores[subject.id] : null,
          }));

        return {
          id: score.id,
          examTypeId: score.examTypeId,
          examTypeName: examType?.name ?? "모의고사",
          examRound: score.examRound,
          examDate: score.examDate,
          totalScore: score.totalScore,
          rankInClass: score.rankInClass,
          notes: score.notes,
          subjects,
        } satisfies StudentExamResultItem;
      });
  }

  const [examTypes, { prisma }] = await Promise.all([
    listExamTypes(divisionSlug),
    import("@/lib/prisma"),
  ]);
  const examTypeMap = new Map(examTypes.map((examType) => [examType.id, examType]));

  const records = await prisma.examScore.findMany({
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
      examTypeId: true,
      examRound: true,
      examDate: true,
      totalScore: true,
      rankInClass: true,
      notes: true,
      scores: true,
      createdAt: true,
    },
    orderBy: [{ examDate: "desc" }, { createdAt: "desc" }],
  });

  return records.map((record) => {
    const rawScores =
      record.scores && typeof record.scores === "object" && !Array.isArray(record.scores)
        ? (record.scores as Record<string, unknown>)
        : {};
    const examType = examTypeMap.get(record.examTypeId);

    return {
      id: record.id,
      examTypeId: record.examTypeId,
      examTypeName: examType?.name ?? "모의고사",
      examRound: record.examRound,
      examDate: toDateString(record.examDate),
      totalScore: record.totalScore,
      rankInClass: record.rankInClass,
      notes: record.notes,
      subjects: sortSubjects(examType?.subjects ?? [])
        .filter((subject) => subject.isActive)
        .map((subject) => ({
          subjectId: subject.id,
          name: subject.name,
          totalItems: subject.totalItems,
          pointsPerItem: subject.pointsPerItem ?? null,
          maxScore: calculateSubjectMaxScore(subject.totalItems, subject.pointsPerItem ?? null),
          score: typeof rawScores[subject.id] === "number" ? (rawScores[subject.id] as number) : null,
        })),
    } satisfies StudentExamResultItem;
  });
}
