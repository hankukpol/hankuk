import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma, ScoreSource } from "@prisma/client";
import { getPrisma } from "../src/lib/prisma";
import { getScoreSourceStats } from "../src/lib/scores/stats";

const SCORE_SOURCES = Object.values(ScoreSource);

function loadEnvFile(filePath: string) {
  try {
    const raw = readFileSync(filePath, "utf8");

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing env files.
  }
}

function loadLocalEnv() {
  const cwd = process.cwd();
  loadEnvFile(path.join(cwd, ".env.local"));
  loadEnvFile(path.join(cwd, ".env"));
}

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

function readScoreContext(value: Prisma.JsonValue | null) {
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

function readSessionSourceContext(value: Prisma.JsonValue | null) {
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

function extractImportUpdatedKeys(
  before: Prisma.JsonValue | null,
  after: Prisma.JsonValue | null,
  sessionIds: Set<number>,
) {
  const afterContext = readSessionSourceContext(after);
  if (!afterContext || !sessionIds.has(afterContext.sessionId)) {
    return [] as string[];
  }

  const beforeRows = asJsonArray(before);
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

async function deriveExpected(periodId: number) {
  const prisma = getPrisma();
  const sessions = await prisma.examSession.findMany({
    where: {
      periodId,
    },
    select: {
      id: true,
    },
  });
  const sessionIdSet = new Set(sessions.map((session) => session.id));

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

  const totalScores = currentScores.length;
  const countBySource = new Map<ScoreSource, number>(
    SCORE_SOURCES.map((sourceType) => [sourceType, 0]),
  );
  const currentSourceByKey = new Map<string, ScoreSource>();

  for (const score of currentScores) {
    currentSourceByKey.set(buildScoreKey(score.sessionId, score.examNumber), score.sourceType);
    countBySource.set(score.sourceType, (countBySource.get(score.sourceType) ?? 0) + 1);
  }

  const auditRows = await prisma.auditLog.findMany({
    where: {
      OR: [
        {
          targetType: "Score",
          action: {
            in: ["SCORE_UPDATE", "SCORE_DELETE"],
          },
        },
        {
          targetType: "ScoreImport",
          action: {
            startsWith: "SCORE_IMPORT_",
          },
        },
      ],
    },
    select: {
      action: true,
      before: true,
      after: true,
    },
  });

  const updatedKeys = new Set<string>();
  const deletedKeys = new Set<string>();
  const deletedSourceByKey = new Map<string, ScoreSource>();

  for (const row of auditRows) {
    if (row.action.startsWith("SCORE_IMPORT_")) {
      const keys = extractImportUpdatedKeys(row.before, row.after, sessionIdSet);
      const afterContext = readSessionSourceContext(row.after);

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

  return {
    totalScores,
    countBySource,
    updatedBySource,
    deletedBySource,
    updatedScoreCount: updatedKeys.size,
    deletedScoreCount: deletedKeys.size,
  };
}

async function collectCandidatePeriodIds() {
  const prisma = getPrisma();
  const periodIds = new Set<number>();

  const scoreBackedPeriods = await prisma.examSession.findMany({
    where: {
      scores: {
        some: {},
      },
    },
    select: {
      periodId: true,
    },
    distinct: ["periodId"],
    orderBy: {
      id: "desc",
    },
    take: 3,
  });

  for (const row of scoreBackedPeriods) {
    periodIds.add(row.periodId);
  }

  const deleteRows = await prisma.auditLog.findMany({
    where: {
      targetType: "Score",
      action: "SCORE_DELETE",
    },
    select: {
      before: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 50,
  });

  const sessionIds = Array.from(
    new Set(
      deleteRows
        .map((row) => readScoreContext(row.before)?.sessionId ?? null)
        .filter((value): value is number => value !== null),
    ),
  );

  if (sessionIds.length > 0) {
    const sessions = await prisma.examSession.findMany({
      where: {
        id: {
          in: sessionIds,
        },
      },
      select: {
        id: true,
        periodId: true,
      },
    });

    for (const session of sessions) {
      periodIds.add(session.periodId);
    }
  }

  return Array.from(periodIds).slice(0, 4);
}

async function main() {
  loadLocalEnv();
  const prisma = getPrisma();
  const periodIds = await collectCandidatePeriodIds();

  if (periodIds.length === 0) {
    console.log(JSON.stringify({ sampleScoreSourceStats: [] }, null, 2));
    await prisma.$disconnect();
    return;
  }

  const samples = [];

  for (const periodId of periodIds) {
    const stats = await getScoreSourceStats(periodId);
    const expected = await deriveExpected(periodId);
    const overallBaseCount = expected.totalScores + expected.deletedScoreCount;

    assert.equal(stats.totalScores, expected.totalScores);
    assert.equal(stats.updatedScoreCount, expected.updatedScoreCount);
    assert.equal(stats.deletedScoreCount, expected.deletedScoreCount);
    assert.equal(stats.editRate, percentage(expected.updatedScoreCount, overallBaseCount));
    assert.equal(stats.deleteRate, percentage(expected.deletedScoreCount, overallBaseCount));
    assert.equal(
      stats.bySourceType.reduce((sum, row) => sum + row.count, 0),
      stats.totalScores,
    );

    assert.deepEqual(
      stats.bySourceType.map((row) => ({
        sourceType: row.sourceType,
        count: row.count,
        updatedCount: row.updatedCount,
        deletedCount: row.deletedCount,
        editRate: row.editRate,
        deleteRate: row.deleteRate,
      })),
      SCORE_SOURCES.map((sourceType) => {
        const count = expected.countBySource.get(sourceType) ?? 0;
        const updatedCount = expected.updatedBySource.get(sourceType)?.size ?? 0;
        const deletedCount = expected.deletedBySource.get(sourceType)?.size ?? 0;
        const baseCount = count + deletedCount;

        return {
          sourceType,
          count,
          updatedCount,
          deletedCount,
          editRate: percentage(updatedCount, baseCount),
          deleteRate: percentage(deletedCount, baseCount),
        };
      }),
    );

    if (stats.totalScores > 0) {
      const percentageSum = stats.bySourceType.reduce((sum, row) => sum + row.percentage, 0);
      assert.ok(percentageSum >= 99.5 && percentageSum <= 100.5);
    }

    assert.ok(stats.editRate >= 0 && stats.editRate <= 100);
    assert.ok(stats.deleteRate >= 0 && stats.deleteRate <= 100);
    assert.ok(stats.bySourceType.every((row) => row.editRate >= 0 && row.editRate <= 100));
    assert.ok(stats.bySourceType.every((row) => row.deleteRate >= 0 && row.deleteRate <= 100));

    samples.push({
      periodId: stats.periodId,
      periodName: stats.periodName,
      totalScores: stats.totalScores,
      updatedScoreCount: stats.updatedScoreCount,
      deletedScoreCount: stats.deletedScoreCount,
      editRate: stats.editRate,
      deleteRate: stats.deleteRate,
      bySourceType: stats.bySourceType,
    });
  }

  console.log(JSON.stringify({ sampleScoreSourceStats: samples }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await getPrisma().$disconnect();
  } catch {
    // Ignore disconnect errors during shutdown.
  }
  process.exit(1);
});
