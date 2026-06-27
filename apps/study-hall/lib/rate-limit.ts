import { tooManyRequests } from "@/lib/errors";

type RateLimitEntry = {
  count: number;
  firstAttempt: number;
};

type RateLimitOptions = {
  bucket?: string;
  maxAttempts?: number;
  windowMs?: number;
};

const attempts = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function pruneAllExpired() {
  const now = Date.now();

  attempts.forEach((entry, key) => {
    if (now - entry.firstAttempt >= 10 * 60 * 1000) {
      attempts.delete(key);
    }
  });
}

if (typeof setInterval !== "undefined") {
  setInterval(pruneAllExpired, CLEANUP_INTERVAL_MS);
}

function getBucketKey(bucket: string, ip: string) {
  return `${bucket}:${ip}`;
}

function getOptions(options?: RateLimitOptions) {
  return {
    bucket: options?.bucket ?? "default",
    maxAttempts: options?.maxAttempts ?? 10,
    windowMs: options?.windowMs ?? 10 * 60 * 1000,
  };
}

function getLimitMessage(windowMs: number) {
  const minutes = Math.ceil(windowMs / 60000);
  return `잠시 후 다시 시도해주세요. (${minutes}분 후 재시도 가능)`;
}

function pruneExpiredEntry(key: string, now: number, windowMs: number) {
  const current = attempts.get(key);

  if (current && now - current.firstAttempt >= windowMs) {
    attempts.delete(key);
    return null;
  }

  return current ?? null;
}

export function getRequestIp(headers: Headers) {
  const trustedHeaders = [
    "x-vercel-forwarded-for",
    "x-real-ip",
    "cf-connecting-ip",
    "fastly-client-ip",
  ];

  for (const header of trustedHeaders) {
    const value = headers.get(header)?.split(",")[0]?.trim();
    if (value) {
      return value;
    }
  }

  if (process.env.TRUST_X_FORWARDED_FOR === "true") {
    const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) {
      return forwarded;
    }
  }

  return "unknown";
}

export function assertRateLimit(ip: string, options?: RateLimitOptions) {
  const { bucket, maxAttempts, windowMs } = getOptions(options);
  const key = getBucketKey(bucket, ip);
  const current = pruneExpiredEntry(key, Date.now(), windowMs);

  if (current && current.count >= maxAttempts) {
    throw tooManyRequests(getLimitMessage(windowMs));
  }
}

export function recordRateLimitFailure(ip: string, options?: RateLimitOptions) {
  const { bucket, maxAttempts, windowMs } = getOptions(options);
  const key = getBucketKey(bucket, ip);
  const now = Date.now();
  const current = pruneExpiredEntry(key, now, windowMs);

  if (!current) {
    attempts.set(key, { count: 1, firstAttempt: now });
    return;
  }

  current.count += 1;
  attempts.set(key, current);

  if (current.count >= maxAttempts) {
    throw tooManyRequests(getLimitMessage(windowMs));
  }
}

export function clearRateLimit(ip: string, bucket = "default") {
  attempts.delete(getBucketKey(bucket, ip));
}
