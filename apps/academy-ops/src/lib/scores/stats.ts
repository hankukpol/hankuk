import { Prisma, ScoreSource } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

const SCORE_SOURCES = Object.values(ScoreSource);
const SCORE_MUTATION_ACTIONS = ["SCORE_UPDATE", "SCORE_DELETE"] as const;

type ScoreAuditRow = {
  targetId: string;
  action: string;
  before: Prisma.JsonValue | null;
  after: Prisma.JsonValue | null;
};

type CurrentScoreRow = {
  sessionId: number;
  examNumber: string;
  sourceType: ScoreSource;
};

type ScoreContext = {
  sessionId: number;
  examNumber: string;
  key: string;
  sourceType: ScoreSource | null;
};

type SessionSourceContext = {
  sessionId: number;
  sourceType: ScoreSource | null;
};

export type ScoreSourceStatRow = {
  sourceType: ScoreSource;
  count: number;
  percentage: number;
  updatedCount: number;
  deletedCount: number;
  editRate: number;
  deleteRate: number;
};

export type ScoreSourceStats = {
  periodId: number;
  periodName: string;
  totalScores: number;
  updatedScoreCount: number;
  deletedScoreCount: number;
  editRate: number;
  deleteRate: number;
  bySourceType: ScoreSourceStatRow[];
};

function roundTo(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentage(count: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return roundTo((count / total) * 100, 1);
}

function asJsonObject(
  value: Prisma.JsonValue | null,
): Record<string, Prisma.JsonValue> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, Prisma.JsonValue>;
}

function asJsonArray(value: Prisma.JsonValue | null): Prisma.JsonArray | null {
  return Array.isArray(value) ? value : null;
}

function readInteger(value: Prisma.JsonValue | undefined) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }

  return null;
}

function readString(value: Prisma.JsonValue | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readScoreSource(value: Prisma.JsonValue | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  return SCORE_SOURCES.includes(value as ScoreSource) ? (value as ScoreSource) : null;
}

function buildScoreKey(sessionId: number, examNumber: string) {
  return `${sessionId}:${examNumber}`;
}

function readScoreContext(value: Prisma.JsonValue | null): ScoreContext | null {
  const objectValue = asJsonObject(value);
  const sessionId = readInteger(objectValue?.sessionId);
  const examNumber = readString(objectValue?.examNumber);

  if (!sessionId || !examNumber) {
    return null;
  }

  return {
    sessionId,
    examNumber,
    key: buildScoreKey(sessionId, examNumber),
    sourceType: readScoreSource(objectValue?.sourceType),
  };
}

function readSessionSourceContext(value: Prisma.JsonValue | null): SessionSourceContext | null {
  const objectValue = asJsonObject(value);
  const sessionId = readInteger(objectValue?.sessionId);

  if (!sessionId) {
    return null;
  }

  return {
    sessionId,
    sourceType: readScoreSource(objectValue?.sourceType),
  };
}

function extractImportUpdatedKeys(row: ScoreAuditRow, sessionIds: Set<number>) {
  const afterContext = readSessionSourceContext(row.after);
  if (!afterContext || !sessionIds.has(afterContext.sessionId)) {
    return [] as string[];
  }

  const beforeRows = asJsonArray(row.before);
  if (!beforeRows || beforeRows.length === 0) {
    return [] as string[];
  }

  const keys = new Set<string>();
  for (const entry of beforeRows) {
    const objectValue = asJsonObject(entry);
    const examNumber = readString(objectValue?.examNumber);
    if (!examNumber) {
      continue;
    }

    keys.add(buildScoreKey(afterContext.sessionId, examNumber));
  }

  return Array.from(keys);
}

function createSourceSetMap() {
  return new Map<ScoreSource, Set<string>>(
    SCORE_SOURCES.map((sourceType) => [sourceType, new Set<string>()]),
  );
}

function buildAfterSessionFilters(sessionIds: readonly number[]): Prisma.AuditLogWhereInput[] {
  return sessionIds.map((sessionId) => ({
    after: {
      path: ["sessionId"],
      equals: sessionId,
    },
  }));
}

function buildBeforeSessionFilters(sessionIds: readonly number[]): Prisma.AuditLogWhereInput[] {
  return sessionIds.map((sessionId) => ({
    before: {
      path: ["sessionId"],
      equals: sessionId,
    },
  }));
}

export async function getScoreSourceStats(periodId: number): Promise<ScoreSourceStats> {
  const prisma = getPrisma();
  const period = await prisma.examPeriod.findUnique({
    where: {
      id: periodId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!period) {
    throw new Error("Exam period not found.");
  }

  const sessions = await prisma.examSession.findMany({
    where: {
      periodId,
    },
    select: {
      id: true,
    },
  });
  const sessionIds = sessions.map((session) => session.id);
  const sessionIdSet = new Set(sessionIds);

  const currentScores = await prisma.score.findMany({
    where: {
      session: {
        periodId,
      },
    },
    select: {
      sessionId: true,
      examNumber: true,
      sourceType: true,
    },
  });

  const currentSourceByKey = new Map<string, ScoreSource>(
    currentScores.map((score: CurrentScoreRow) => [
      buildScoreKey(score.sessionId, score.examNumber),
      score.sourceType,
    ]),
  );
  const countBySource = new Map<ScoreSource, number>(
    SCORE_SOURCES.map((sourceType) => [sourceType, 0]),
  );

  for (const score of currentScores) {
    countBySource.set(score.sourceType, (countBySource.get(score.sourceType) ?? 0) + 1);
  }

  const totalScores = currentScores.length;
  const updatedKeys = new Set<string>();
  const deletedKeys = new Set<string>();
  const deletedSourceByKey = new Map<string, ScoreSource>();

  if (sessionIds.length > 0) {
    const auditRows = await prisma.auditLog.findMany({
      where: {
        OR: [
          {
            targetType: "Score",
            action: {
              in: [...SCORE_MUTATION_ACTIONS],
            },
            OR: [...buildAfterSessionFilters(sessionIds), ...buildBeforeSessionFilters(sessionIds)],
          },
          {
            targetType: "ScoreImport",
            action: {
              startsWith: "SCORE_IMPORT_",
            },
            OR: buildAfterSessionFilters(sessionIds),
          },
        ],
      },
      select: {
        targetId: true,
        action: true,
        before: true,
        after: true,
      },
    });

    for (const row of auditRows) {
      if (row.action.startsWith("SCORE_IMPORT_")) {
        const keys = extractImportUpdatedKeys(row, sessionIdSet);

        for (const key of keys) {
          updatedKeys.add(key);
        }
        continue;
      }

      const beforeContext = readScoreContext(row.before);
      const afterContext = readScoreContext(row.after);
      const context = afterContext ?? beforeContext;

      if (!context || !sessionIdSet.has(context.sessionId)) {
        continue;
      }

      const sourceType = afterContext?.sourceType ?? beforeContext?.sourceType ?? null;

      if (row.action === "SCORE_UPDATE") {
        updatedKeys.add(context.key);
        continue;
      }

      if (row.action === "SCORE_DELETE") {
        deletedKeys.add(context.key);
        if (sourceType) {
          deletedSourceByKey.set(context.key, sourceType);
        }
      }
    }
  }

  const updatedBySource = createSourceSetMap();
  const deletedBySource = createSourceSetMap();

  for (const [key, sourceType] of deletedSourceByKey) {
    deletedBySource.get(sourceType)?.add(key);
  }

  for (const key of updatedKeys) {
    const sourceType =
      currentSourceByKey.get(key) ??
      deletedSourceByKey.get(key) ??
      null;

    if (sourceType) {
      updatedBySource.get(sourceType)?.add(key);
    }
  }

  const deletedScoreCount = deletedKeys.size;
  const overallBaseCount = totalScores + deletedScoreCount;

  return {
    periodId: period.id,
    periodName: period.name,
    totalScores,
    updatedScoreCount: updatedKeys.size,
    deletedScoreCount,
    editRate: percentage(updatedKeys.size, overallBaseCount),
    deleteRate: percentage(deletedScoreCount, overallBaseCount),
    bySourceType: SCORE_SOURCES.map((sourceType) => {
      const count = countBySource.get(sourceType) ?? 0;
      const updatedCount = updatedBySource.get(sourceType)?.size ?? 0;
      const deletedCount = deletedBySource.get(sourceType)?.size ?? 0;
      const baseCount = count + deletedCount;

      return {
        sourceType,
        count,
        percentage: percentage(count, totalScores),
        updatedCount,
        deletedCount,
        editRate: percentage(updatedCount, baseCount),
        deleteRate: percentage(deletedCount, baseCount),
      } satisfies ScoreSourceStatRow;
    }),
  };
}
