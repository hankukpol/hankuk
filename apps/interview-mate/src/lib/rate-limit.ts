import { logRouteError } from "@/lib/http";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type CheckRateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
};

type RateLimitRpcPayload = {
  allowed?: boolean;
  limit?: number;
  remaining?: number;
  resetAt?: string;
  retryAfterSec?: number;
};

const buckets = new Map<string, RateLimitBucket>();
let hasLoggedDatabaseFallback = false;

function pruneExpiredBuckets(now: number) {
  buckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  });
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.trim();

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}

export function buildRateLimitKey(
  request: Request,
  scope: string,
  subject?: string | null,
) {
  const normalizedSubject = subject?.trim() || "anonymous";
  return `${scope}:${getClientIp(request)}:${normalizedSubject}`;
}

function checkRateLimitInMemory({
  key,
  limit,
  windowMs,
}: CheckRateLimitOptions): RateLimitResult {
  const now = Date.now();
  pruneExpiredBuckets(now);

  const currentBucket = buckets.get(key);

  if (!currentBucket || currentBucket.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, {
      count: 1,
      resetAt,
    });

    return {
      allowed: true,
      limit,
      remaining: Math.max(limit - 1, 0),
      resetAt,
      retryAfterSec: Math.ceil(windowMs / 1000),
    };
  }

  if (currentBucket.count >= limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: currentBucket.resetAt,
      retryAfterSec: Math.max(
        Math.ceil((currentBucket.resetAt - now) / 1000),
        1,
      ),
    };
  }

  currentBucket.count += 1;
  buckets.set(key, currentBucket);

  return {
    allowed: true,
    limit,
    remaining: Math.max(limit - currentBucket.count, 0),
    resetAt: currentBucket.resetAt,
    retryAfterSec: Math.max(
      Math.ceil((currentBucket.resetAt - now) / 1000),
      1,
    ),
  };
}

function normalizeRateLimitResult(
  payload: unknown,
): RateLimitResult | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as RateLimitRpcPayload;
  const resetAt = candidate.resetAt ? Date.parse(candidate.resetAt) : Number.NaN;

  if (
    typeof candidate.allowed !== "boolean" ||
    typeof candidate.limit !== "number" ||
    typeof candidate.remaining !== "number" ||
    Number.isNaN(resetAt) ||
    typeof candidate.retryAfterSec !== "number"
  ) {
    return null;
  }

  return {
    allowed: candidate.allowed,
    limit: candidate.limit,
    remaining: candidate.remaining,
    resetAt,
    retryAfterSec: candidate.retryAfterSec,
  };
}

function logRateLimitFallback(error: unknown) {
  if (hasLoggedDatabaseFallback) {
    return;
  }

  hasLoggedDatabaseFallback = true;
  logRouteError("rate-limit:fallback-to-memory", error);
}

export async function checkRateLimit({
  key,
  limit,
  windowMs,
}: CheckRateLimitOptions): Promise<RateLimitResult> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return checkRateLimitInMemory({ key, limit, windowMs });
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_ms: windowMs,
    });

    if (error) {
      throw error;
    }

    const result = normalizeRateLimitResult(data);

    if (!result) {
      throw new Error("Invalid consume_rate_limit response.");
    }

    return result;
  } catch (error) {
    logRateLimitFallback(error);
    return checkRateLimitInMemory({ key, limit, windowMs });
  }
}

export function resetRateLimitStateForTest() {
  buckets.clear();
  hasLoggedDatabaseFallback = false;
}

export function createRateLimitHeaders(result: RateLimitResult) {
  return {
    "Cache-Control": "no-store",
    "Retry-After": String(result.retryAfterSec),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}
