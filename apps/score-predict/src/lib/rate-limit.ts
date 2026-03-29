import "server-only";

interface FixedWindowBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSec: number;
  remaining: number;
}

const fixedWindowBuckets = new Map<string, FixedWindowBucket>();
const MAX_BUCKETS = 5000;

function cleanupExpiredBuckets(now: number) {
  for (const [key, bucket] of fixedWindowBuckets.entries()) {
    if (bucket.resetAt <= now) {
      fixedWindowBuckets.delete(key);
    }
  }
}

function buildBucketSaturationDecision(): RateLimitDecision {
  return {
    allowed: false,
    retryAfterSec: 1,
    remaining: 0,
  };
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function normalizeWindowMs(value: number): number {
  if (!Number.isFinite(value)) return 1000;
  return Math.max(1, Math.floor(value));
}

function getBucketKey(namespace: string, key: string): string {
  return `${namespace}:${key}`;
}

function getActiveBucket(bucketKey: string, now: number): FixedWindowBucket | undefined {
  const current = fixedWindowBuckets.get(bucketKey);
  if (!current) {
    return undefined;
  }

  if (current.resetAt <= now) {
    fixedWindowBuckets.delete(bucketKey);
    return undefined;
  }

  return current;
}

function canAllocateBucket(now: number): boolean {
  if (fixedWindowBuckets.size < MAX_BUCKETS) {
    return true;
  }

  cleanupExpiredBuckets(now);
  return fixedWindowBuckets.size < MAX_BUCKETS;
}

function buildDecisionFromBucket(
  current: FixedWindowBucket | undefined,
  now: number,
  limit: number
): RateLimitDecision {
  if (!current || current.resetAt <= now) {
    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.max(0, limit),
    };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      remaining: 0,
    };
  }

  return {
    allowed: true,
    retryAfterSec: 0,
    remaining: Math.max(0, limit - current.count),
  };
}

export function getFixedWindowRateLimitState(params: {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitDecision {
  const { namespace, key } = params;
  const limit = normalizeLimit(params.limit);
  const now = Date.now();
  const bucketKey = getBucketKey(namespace, key);
  const current = getActiveBucket(bucketKey, now);

  if (!current && !canAllocateBucket(now)) {
    return buildBucketSaturationDecision();
  }

  return buildDecisionFromBucket(current, now, limit);
}

export function consumeFixedWindowRateLimit(params: {
  namespace: string;
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitDecision {
  const { namespace, key } = params;
  const limit = normalizeLimit(params.limit);
  const windowMs = normalizeWindowMs(params.windowMs);
  const now = Date.now();
  const bucketKey = getBucketKey(namespace, key);
  const current = getActiveBucket(bucketKey, now);

  if (!current) {
    if (!canAllocateBucket(now)) {
      return buildBucketSaturationDecision();
    }

    fixedWindowBuckets.set(bucketKey, {
      count: 1,
      resetAt: now + windowMs,
    });

    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.max(0, limit - 1),
    };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      remaining: 0,
    };
  }

  current.count += 1;
  fixedWindowBuckets.set(bucketKey, current);

  return {
    allowed: true,
    retryAfterSec: 0,
    remaining: Math.max(0, limit - current.count),
  };
}

export function resetFixedWindowRateLimit(params: { namespace: string; key: string }): void {
  fixedWindowBuckets.delete(getBucketKey(params.namespace, params.key));
}
