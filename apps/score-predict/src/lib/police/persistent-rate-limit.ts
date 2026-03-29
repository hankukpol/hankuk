import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { RateLimitDecision } from "@/lib/rate-limit";

const MAX_TRANSACTION_RETRIES = 3;

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function normalizeWindowMs(value: number): number {
  if (!Number.isFinite(value)) return 1000;
  return Math.max(1, Math.floor(value));
}

function getWindowBounds(windowMs: number, nowMs = Date.now()) {
  const startedAtMs = Math.floor(nowMs / windowMs) * windowMs;
  const expiresAtMs = startedAtMs + windowMs;
  return {
    nowMs,
    startedAt: new Date(startedAtMs),
    expiresAt: new Date(expiresAtMs),
  };
}

function buildAllowedDecision(limit: number, count: number): RateLimitDecision {
  return {
    allowed: true,
    retryAfterSec: 0,
    remaining: Math.max(0, limit - count),
  };
}

function buildBlockedDecision(expiresAt: Date, nowMs: number): RateLimitDecision {
  return {
    allowed: false,
    retryAfterSec: Math.max(1, Math.ceil((expiresAt.getTime() - nowMs) / 1000)),
    remaining: 0,
  };
}

function isRetryableRateLimitError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

async function withSerializableRetry<T>(task: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await task();
    } catch (error) {
      if (!isRetryableRateLimitError(error) || attempt >= MAX_TRANSACTION_RETRIES - 1) {
        throw error;
      }
      attempt += 1;
    }
  }
}

export async function getPersistentFixedWindowRateLimitState(params: {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitDecision> {
  const limit = normalizeLimit(params.limit);
  const windowMs = normalizeWindowMs(params.windowMs);
  const { nowMs, startedAt } = getWindowBounds(windowMs);

  const bucket = await prisma.authRateLimitBucket.findUnique({
    where: {
      namespace_key: {
        namespace: params.namespace,
        key: params.key,
      },
    },
    select: {
      count: true,
      windowStartedAt: true,
      expiresAt: true,
    },
  });

  if (!bucket || bucket.windowStartedAt.getTime() !== startedAt.getTime()) {
    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: limit,
    };
  }

  if (bucket.count >= limit) {
    return buildBlockedDecision(bucket.expiresAt, nowMs);
  }

  return {
    allowed: true,
    retryAfterSec: 0,
    remaining: Math.max(0, limit - bucket.count),
  };
}

export async function consumePersistentFixedWindowRateLimit(params: {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitDecision> {
  const limit = normalizeLimit(params.limit);
  const windowMs = normalizeWindowMs(params.windowMs);

  return withSerializableRetry(async () =>
    prisma.$transaction(
      async (tx) => {
        const { nowMs, startedAt, expiresAt } = getWindowBounds(windowMs);

        const bucket = await tx.authRateLimitBucket.findUnique({
          where: {
            namespace_key: {
              namespace: params.namespace,
              key: params.key,
            },
          },
        });

        if (!bucket || bucket.windowStartedAt.getTime() !== startedAt.getTime()) {
          if (bucket) {
            await tx.authRateLimitBucket.update({
              where: { id: bucket.id },
              data: {
                count: 1,
                windowStartedAt: startedAt,
                expiresAt,
              },
            });
          } else {
            await tx.authRateLimitBucket.create({
              data: {
                namespace: params.namespace,
                key: params.key,
                count: 1,
                windowStartedAt: startedAt,
                expiresAt,
              },
            });
          }

          return buildAllowedDecision(limit, 1);
        }

        if (bucket.count >= limit) {
          return buildBlockedDecision(bucket.expiresAt, nowMs);
        }

        const updated = await tx.authRateLimitBucket.update({
          where: { id: bucket.id },
          data: {
            count: {
              increment: 1,
            },
            expiresAt,
          },
          select: {
            count: true,
          },
        });

        return buildAllowedDecision(limit, updated.count);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    )
  );
}

export async function resetPersistentFixedWindowRateLimit(params: {
  namespace: string;
  key: string;
}): Promise<void> {
  await prisma.authRateLimitBucket.deleteMany({
    where: {
      namespace: params.namespace,
      key: params.key,
    },
  });
}

export async function cleanupExpiredPersistentRateLimitBuckets(before = new Date()): Promise<number> {
  const result = await prisma.authRateLimitBucket.deleteMany({
    where: {
      expiresAt: {
        lt: before,
      },
    },
  });

  return result.count;
}
