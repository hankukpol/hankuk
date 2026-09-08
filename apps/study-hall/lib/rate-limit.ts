import { isIP } from "node:net";
import { tooManyRequests } from "@/lib/errors";

type RateLimitEntry = {
  count: number;
  firstAttempt: number;
  expiresAt: number;
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
    if (now >= entry.expiresAt) {
      attempts.delete(key);
    }
  });
}

if (typeof setInterval !== "undefined") {
  const cleanup = setInterval(pruneAllExpired, CLEANUP_INTERVAL_MS);
  cleanup.unref?.();
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
  // Proxy headers are caller-controlled unless the deployment overwrites them.
  // A self-hosted proxy opting in must overwrite X-Forwarded-For at its boundary.
  const value = process.env.VERCEL === "1"
    ? headers.get("x-vercel-forwarded-for")
    : process.env.TRUST_X_FORWARDED_FOR === "true"
      ? headers.get("x-forwarded-for")
      : null;
  const ip = value?.split(",", 1)[0]?.trim();
  return ip && isIP(ip) ? ip : "unknown";
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
    attempts.set(key, { count: 1, firstAttempt: now, expiresAt: now + windowMs });
    return;
  }

  current.count += 1;
  current.expiresAt = current.firstAttempt + windowMs;

  if (current.count >= maxAttempts) {
    throw tooManyRequests(getLimitMessage(windowMs));
  }
}

export function clearRateLimit(ip: string, bucket = "default") {
  attempts.delete(getBucketKey(bucket, ip));
}
