import { cache as reactCache } from "react";
import { unstable_cache } from "next/cache";
import {
  AbsenceStatus,
  AttendType,
  ExamType,
  PointType,
  Prisma,
  StudentStatus,
  StudentType,
  Subject,
} from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { CACHE_TAGS } from "@/lib/cache-tags";

const ANALYTICS_REVALIDATE_SECONDS = 60;

const cacheFn: typeof reactCache =
  typeof reactCache === "function"
    ? reactCache
    : (((fn: Parameters<typeof reactCache>[0]) => fn) as typeof reactCache);


type DatasetPeriod = Prisma.ExamPeriodGetPayload<{
  select: {
    id: true;
    name: true;
    startDate: true;
    endDate: true;
    totalWeeks: true;
    isActive: true;
  };
}>;

export type DatasetSession = {
  id: number;
  week: number;
  subject: Subject;
  displaySubjectName: string | null;
  examDate: Date;
  isCancelled: boolean;
  periodId: number;
  examType: ExamType;
};

export type DatasetStudent = {
  examNumber: string;
  name: string;
  phone: string | null;
  generation: number | null;
  className: string | null;
  studentType: StudentType;
  isActive: boolean;
  notificationConsent: boolean;
  currentStatus: StudentStatus;
};

export type DatasetScore = {
  id: number;
  examNumber: string;
  sessionId: number;
  attendType: AttendType;
  rawScore: number | null;
  oxScore: number | null;
  finalScore: number | null;
};

export type DatasetAbsence = {
  examNumber: string;
  sessionId: number;
  attendCountsAsAttendance: boolean;
  attendGrantsPerfectAttendance: boolean;
  status: AbsenceStatus;
};

export type DatasetPointLog = {
  id: number;
  examNumber: string;
  type: PointType;
  amount: number;
  reason: string;
  periodId: number | null;
  month: number | null;
  year: number | null;
  grantedAt: Date;
  grantedBy: string | null;
  student: {
    name: string;
  };
};

export type ResultsSheetStudent = {
  examNumber: string;
  name: string;
  studentType: StudentType;
  isActive: boolean;
};

export type ResultsSheetApprovedAbsence = {
  examNumber: string;
  sessionId: number;
  attendCountsAsAttendance: boolean;
  attendGrantsPerfectAttendance: boolean;
};

export type AnalyticsDataset = {
  period: DatasetPeriod;
  sessions: DatasetSession[];
  students: DatasetStudent[];
  scores: DatasetScore[];
  absenceNotes: DatasetAbsence[];
  pointLogs: DatasetPointLog[];
};

export type ResultsSheetDataset = {
  period: DatasetPeriod;
  sessions: DatasetSession[];
  students: ResultsSheetStudent[];
  scores: DatasetScore[];
  approvedAbsences: ResultsSheetApprovedAbsence[];
};

function serializeExamNumbers(examNumbers?: string[]) {
  return examNumbers && examNumbers.length > 0 ? JSON.stringify(examNumbers) : "";
}

function deserializeExamNumbers(serialized: string) {
  if (!serialized) {
    return undefined;
  }

  return JSON.parse(serialized) as string[];
}

function serializeDate(value?: Date) {
  return value ? value.toISOString() : "";
}

function deserializeDate(value: string) {
  return value ? new Date(value) : undefined;
}

function reviveDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function normalizePeriod<T extends { startDate: Date | string; endDate: Date | string }>(
  period: T,
): T & { startDate: Date; endDate: Date } {
  return {
    ...period,
    startDate: reviveDate(period.startDate),
    endDate: reviveDate(period.endDate),
  };
}

function normalizeSession<T extends { examDate: Date | string }>(
  session: T,
): T & { examDate: Date } {
  return {
    ...session,
    examDate: reviveDate(session.examDate),
  };
}

function normalizePointLog<T extends { grantedAt: Date | string }>(
  pointLog: T,
): T & { grantedAt: Date } {
  return {
    ...pointLog,
    grantedAt: reviveDate(pointLog.grantedAt),
  };
}

function normalizeAnalyticsDataset(dataset: AnalyticsDataset): AnalyticsDataset {
  return {
    ...dataset,
    period: normalizePeriod(dataset.period),
    sessions: dataset.sessions.map((session) => normalizeSession(session)),
    pointLogs: dataset.pointLogs.map((pointLog) => normalizePointLog(pointLog)),
  };
}

function normalizeResultsSheetDataset(dataset: ResultsSheetDataset): ResultsSheetDataset {
  return {
    ...dataset,
    period: normalizePeriod(dataset.period),
    sessions: dataset.sessions.map((session) => normalizeSession(session)),
  };
}

function isMissingNextCacheError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  return (
    message.includes("incrementalCache missing") ||
    message.includes("static generation store missing")
  );
}

export function buildPeriodScopedStudentWhere(
  periodId: number,
  examType?: ExamType,
  options?: {
    includePointLogs?: boolean;
  },
): Prisma.StudentWhereInput {
  const includePointLogs = options?.includePointLogs ?? true;

  return {
    examType,
    OR: [
      {
        enrollments: {
          some: {
            periodId,
          },
        },
      },
      {
        scores: {
          some: {
            session: {
              periodId,
              examType,
            },
          },
        },
      },
      {
        absenceNotes: {
          some: {
            session: {
              periodId,
              examType,
            },
          },
        },
      },
      ...(includePointLogs
        ? [
            {
              pointLogs: {
                some: {
                  periodId,
                },
              },
            },
          ]
        : []),
    ],
  };
}

async function loadDatasetRaw(
  periodId: number,
  examType: ExamType,
  serializedExamNumbers: string,
  includePointLogs: boolean,
): Promise<AnalyticsDataset> {
  const prisma = getPrisma();
  const examNumbers = deserializeExamNumbers(serializedExamNumbers);
  const studentFilter = examNumbers?.length
    ? {
        examType,
        examNumber: {
          in: examNumbers,
        },
      }
    : buildPeriodScopedStudentWhere(periodId, examType);
  const scoreStudentFilter = examNumbers?.length
    ? {
        in: examNumbers,
      }
    : undefined;

  const [period, sessions, students, scores, absenceNotes, pointLogs] = await Promise.all([
    prisma.examPeriod.findUniqueOrThrow({
      where: { id: periodId },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        totalWeeks: true,
        isActive: true,
      },
    }),
    prisma.examSession.findMany({
      where: {
        periodId,
        examType,
      },
      orderBy: [{ examDate: "asc" }, { week: "asc" }],
    }),
    prisma.student.findMany({
      where: studentFilter,
      orderBy: [{ isActive: "desc" }, { examNumber: "asc" }],
      select: {
        examNumber: true,
        name: true,
        phone: true,
        generation: true,
        className: true,
        studentType: true,
        isActive: true,
        notificationConsent: true,
        currentStatus: true,
      },
    }),
    prisma.score.findMany({
      where: {
        session: {
          periodId,
          examType,
        },
        student: {
          examType,
          ...(scoreStudentFilter ? { examNumber: scoreStudentFilter } : {}),
        },
      },
      select: {
        id: true,
        examNumber: true,
        sessionId: true,
        attendType: true,
        rawScore: true,
        oxScore: true,
        finalScore: true,
      },
    }),
    prisma.absenceNote.findMany({
      where: {
        session: {
          periodId,
          examType,
        },
        student: {
          examType,
          ...(scoreStudentFilter ? { examNumber: scoreStudentFilter } : {}),
        },
      },
      select: {
        examNumber: true,
        sessionId: true,
        attendCountsAsAttendance: true,
        attendGrantsPerfectAttendance: true,
        status: true,
      },
    }),
    includePointLogs
      ? prisma.pointLog.findMany({
          where: {
            periodId,
            student: {
              examType,
              ...(scoreStudentFilter ? { examNumber: scoreStudentFilter } : {}),
            },
          },
          select: {
            id: true,
            examNumber: true,
            type: true,
            amount: true,
            reason: true,
            periodId: true,
            month: true,
            year: true,
            grantedAt: true,
            grantedBy: true,
            student: {
              select: {
                name: true,
              },
            },
          },
          orderBy: {
            grantedAt: "desc",
          },
        })
      : Promise.resolve([] as DatasetPointLog[]),
  ]);

  return {
    period,
    sessions: sessions as DatasetSession[],
    students: students as DatasetStudent[],
    scores: scores as DatasetScore[],
    absenceNotes: absenceNotes as DatasetAbsence[],
    pointLogs: pointLogs as DatasetPointLog[],
  };
}

const loadDatasetShared = unstable_cache(
  loadDatasetRaw,
  ["analytics-load-dataset"],
  { revalidate: ANALYTICS_REVALIDATE_SECONDS, tags: [CACHE_TAGS.analyticsDataset] },
);
const loadDatasetCached = cacheFn(async (
  periodId: number,
  examType: ExamType,
  serializedExamNumbers: string,
  includePointLogs: boolean,
): Promise<AnalyticsDataset> => {
  const dataset = await loadDatasetShared(
    periodId,
    examType,
    serializedExamNumbers,
    includePointLogs,
  );
  return normalizeAnalyticsDataset(dataset);
});

export async function loadDataset(
  periodId: number,
  examType: ExamType,
  examNumbers?: string[],
  options?: {
    includePointLogs?: boolean;
  },
): Promise<AnalyticsDataset> {
  const serializedExamNumbers = serializeExamNumbers(examNumbers);
  const includePointLogs = options?.includePointLogs ?? false;

  try {
    return await loadDatasetCached(
      periodId,
      examType,
      serializedExamNumbers,
      includePointLogs,
    );
  } catch (error) {
    if (!isMissingNextCacheError(error)) {
      throw error;
    }

    const dataset = await loadDatasetRaw(
      periodId,
      examType,
      serializedExamNumbers,
      includePointLogs,
    );
    return normalizeAnalyticsDataset(dataset);
  }
}

async function loadResultsSheetDatasetRaw(
  periodId: number,
  examType: ExamType,
  serializedGte: string,
  serializedLt: string,
  serializedLte: string,
): Promise<ResultsSheetDataset> {
  const prisma = getPrisma();
  const [period, sessions, students] = await Promise.all([
    prisma.examPeriod.findUniqueOrThrow({
      where: { id: periodId },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        totalWeeks: true,
        isActive: true,
      },
    }),
    prisma.examSession.findMany({
      where: {
        periodId,
        examType,
        examDate: {
          gte: deserializeDate(serializedGte),
          lt: deserializeDate(serializedLt),
          lte: deserializeDate(serializedLte),
        },
      },
      orderBy: [{ examDate: "asc" }, { week: "asc" }],
    }) as Promise<DatasetSession[]>,
    prisma.student.findMany({
      where: buildPeriodScopedStudentWhere(periodId, examType, {
        includePointLogs: false,
      }),
      orderBy: [{ isActive: "desc" }, { examNumber: "asc" }],
      select: {
        examNumber: true,
        name: true,
        studentType: true,
        isActive: true,
      },
    }) as Promise<ResultsSheetStudent[]>,
  ]);
  const sessionIds = sessions.map((session) => session.id);

  if (sessionIds.length === 0) {
    return {
      period,
      sessions,
      students,
      scores: [],
      approvedAbsences: [],
    };
  }

  const [scores, approvedAbsences] = await Promise.all([
    prisma.score.findMany({
      where: {
        sessionId: {
          in: sessionIds,
        },
      },
      select: {
        id: true,
        examNumber: true,
        sessionId: true,
        attendType: true,
        rawScore: true,
        oxScore: true,
        finalScore: true,
      },
    }),
    prisma.absenceNote.findMany({
      where: {
        sessionId: {
          in: sessionIds,
        },
        status: AbsenceStatus.APPROVED,
      },
      select: {
        examNumber: true,
        sessionId: true,
        attendCountsAsAttendance: true,
        attendGrantsPerfectAttendance: true,
      },
    }),
  ]);

  return {
    period,
    sessions,
    students,
    scores: scores as DatasetScore[],
    approvedAbsences: approvedAbsences as ResultsSheetApprovedAbsence[],
  };
}

const loadResultsSheetDatasetShared = unstable_cache(
  loadResultsSheetDatasetRaw,
  ["analytics-load-results-sheet-dataset"],
  { revalidate: ANALYTICS_REVALIDATE_SECONDS, tags: [CACHE_TAGS.analyticsResultsSheet] },
);
const loadResultsSheetDatasetCached = cacheFn(async (
  periodId: number,
  examType: ExamType,
  serializedGte: string,
  serializedLt: string,
  serializedLte: string,
): Promise<ResultsSheetDataset> => {
  const dataset = await loadResultsSheetDatasetShared(
    periodId,
    examType,
    serializedGte,
    serializedLt,
    serializedLte,
  );
  return normalizeResultsSheetDataset(dataset);
});

export async function loadResultsSheetDataset(
  periodId: number,
  examType: ExamType,
  sessionsWhere?: {
    examDate?: {
      gte?: Date;
      lt?: Date;
      lte?: Date;
    };
  },
): Promise<ResultsSheetDataset> {
  const serializedGte = serializeDate(sessionsWhere?.examDate?.gte);
  const serializedLt = serializeDate(sessionsWhere?.examDate?.lt);
  const serializedLte = serializeDate(sessionsWhere?.examDate?.lte);

  try {
    return await loadResultsSheetDatasetCached(
      periodId,
      examType,
      serializedGte,
      serializedLt,
      serializedLte,
    );
  } catch (error) {
    if (!isMissingNextCacheError(error)) {
      throw error;
    }

    const dataset = await loadResultsSheetDatasetRaw(
      periodId,
      examType,
      serializedGte,
      serializedLt,
      serializedLte,
    );
    return normalizeResultsSheetDataset(dataset);
  }
}

