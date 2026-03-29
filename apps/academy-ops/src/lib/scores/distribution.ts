import { AttendType } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { NON_PLACEHOLDER_STUDENT_FILTER } from "@/lib/students/placeholder";

const DISTRIBUTION_BIN_SIZE = 10;

type ScoreValueRow = {
  finalScore: number | null;
};

export type ScoreDistributionBucket = {
  range: string;
  count: number;
};

export type ScoreDistributionSummary = {
  sessionId: number;
  totalCount: number;
  avgScore: number | null;
  stdDev: number | null;
  maxScore: number | null;
  minScore: number | null;
  top10Threshold: number | null;
  top30Threshold: number | null;
  distribution: ScoreDistributionBucket[];
};

function roundTo(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStandardDeviation(values: number[], mean: number | null) {
  if (values.length < 2 || mean === null) {
    return null;
  }

  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);

  return roundTo(Math.sqrt(variance), 1);
}

function percentileCont(values: number[], percentile: number) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const rank = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const lowerValue = sorted[lowerIndex] ?? sorted[sorted.length - 1] ?? null;
  const upperValue = sorted[upperIndex] ?? lowerValue;

  if (lowerValue === null) {
    return null;
  }

  if (lowerIndex === upperIndex) {
    return roundTo(lowerValue, 1);
  }

  const interpolated = lowerValue + (upperValue - lowerValue) * (rank - lowerIndex);
  return roundTo(interpolated, 1);
}

function buildDistribution(values: number[]) {
  const maxValue = values.length > 0 ? Math.max(...values) : 100;
  const upperBound = Math.max(100, Math.ceil(maxValue / DISTRIBUTION_BIN_SIZE) * DISTRIBUTION_BIN_SIZE);
  const bucketCount = Math.max(1, upperBound / DISTRIBUTION_BIN_SIZE);

  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const start = index * DISTRIBUTION_BIN_SIZE;
    const isLast = index === bucketCount - 1;
    const end = isLast ? upperBound : start + DISTRIBUTION_BIN_SIZE - 1;

    return {
      range: `${start}-${end}`,
      count: 0,
    } satisfies ScoreDistributionBucket;
  });

  for (const value of values) {
    const safeValue = Math.max(0, value);
    const index = Math.min(Math.floor(safeValue / DISTRIBUTION_BIN_SIZE), buckets.length - 1);
    const bucket = buckets[index];

    if (bucket) {
      bucket.count += 1;
    }
  }

  return buckets;
}

function normalizeValues(rows: ScoreValueRow[]) {
  return rows
    .map((row) => row.finalScore)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

export async function getScoreDistributionSummary(
  sessionId: number,
): Promise<ScoreDistributionSummary> {
  const prisma = getPrisma();
  const session = await prisma.examSession.findUnique({
    where: {
      id: sessionId,
    },
    select: {
      id: true,
      isCancelled: true,
    },
  });

  if (!session) {
    throw new Error("\uC2DC\uD5D8 \uD68C\uCC28\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }

  if (session.isCancelled) {
    throw new Error("\uCDE8\uC18C\uB41C \uD68C\uCC28\uB294 \uBD84\uD3EC\uB97C \uC870\uD68C\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  const scoreRows = await prisma.score.findMany({
    where: {
      sessionId,
      attendType: AttendType.NORMAL,
      student: NON_PLACEHOLDER_STUDENT_FILTER,
    },
    select: {
      finalScore: true,
    },
  });

  const values = normalizeValues(scoreRows);
  const mean = average(values);
  const avgScore = mean === null ? null : roundTo(mean, 1);

  return {
    sessionId,
    totalCount: values.length,
    avgScore,
    stdDev: sampleStandardDeviation(values, mean),
    maxScore: values.length > 0 ? roundTo(Math.max(...values), 1) : null,
    minScore: values.length > 0 ? roundTo(Math.min(...values), 1) : null,
    top10Threshold: percentileCont(values, 0.9),
    top30Threshold: percentileCont(values, 0.7),
    distribution: buildDistribution(values),
  };
}