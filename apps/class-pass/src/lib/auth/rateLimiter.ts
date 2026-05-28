import { createServerClient } from '@/lib/supabase/server'

interface RateLimitEntry {
  attempts: number
  resetAt: number
}

export interface RateLimitResult {
  allowed: boolean
  remainingAttempts: number
  retryAfterMs: number
}

export interface RateLimitOptions {
  maxAttempts?: number
  windowSeconds?: number
}

type DbRateLimitRow = {
  allowed: boolean
  remaining_attempts: number
  retry_after_ms: number
}

const store = new Map<string, RateLimitEntry>()
const DEFAULT_MAX_ATTEMPTS = 5
const DEFAULT_WINDOW_SECONDS = 15 * 60

function getRateLimitConfig(options?: RateLimitOptions) {
  const maxAttempts = Number.isInteger(options?.maxAttempts) && Number(options?.maxAttempts) > 0
    ? Number(options?.maxAttempts)
    : DEFAULT_MAX_ATTEMPTS
  const windowSeconds = Number.isInteger(options?.windowSeconds) && Number(options?.windowSeconds) > 0
    ? Number(options?.windowSeconds)
    : DEFAULT_WINDOW_SECONDS

  return {
    maxAttempts,
    windowSeconds,
    windowMs: windowSeconds * 1000,
  }
}

function getActiveEntry(key: string, now: number): RateLimitEntry | null {
  const entry = store.get(key)

  if (!entry) {
    return null
  }

  if (entry.resetAt < now) {
    store.delete(key)
    return null
  }

  return entry
}

function toRateLimitResult(entry: RateLimitEntry | null, now: number, maxAttempts = DEFAULT_MAX_ATTEMPTS): RateLimitResult {
  if (!entry) {
    return {
      allowed: true,
      remainingAttempts: maxAttempts,
      retryAfterMs: 0,
    }
  }

  if (entry.attempts >= maxAttempts) {
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterMs: Math.max(entry.resetAt - now, 0),
    }
  }

  return {
    allowed: true,
    remainingAttempts: Math.max(maxAttempts - entry.attempts, 0),
    retryAfterMs: 0,
  }
}

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt < now) {
        store.delete(key)
      }
    }
  }, 5 * 60 * 1000)
}

function checkLocalRateLimit(key: string, options?: RateLimitOptions): RateLimitResult {
  const config = getRateLimitConfig(options)
  const now = Date.now()
  const entry = getActiveEntry(key, now)

  if (!entry) {
    const nextEntry = { attempts: 1, resetAt: now + config.windowMs }
    store.set(key, nextEntry)
    return {
      allowed: true,
      remainingAttempts: config.maxAttempts - 1,
      retryAfterMs: 0,
    }
  }

  if (entry.attempts >= config.maxAttempts) {
    return toRateLimitResult(entry, now, config.maxAttempts)
  }

  entry.attempts += 1
  return {
    allowed: true,
    remainingAttempts: Math.max(config.maxAttempts - entry.attempts, 0),
    retryAfterMs: 0,
  }
}

function peekLocalRateLimit(key: string, options?: RateLimitOptions): RateLimitResult {
  const config = getRateLimitConfig(options)
  const now = Date.now()
  return toRateLimitResult(getActiveEntry(key, now), now, config.maxAttempts)
}

function recordLocalRateLimitFailure(key: string, options?: RateLimitOptions): RateLimitResult {
  const config = getRateLimitConfig(options)
  const now = Date.now()
  const entry = getActiveEntry(key, now)

  if (!entry) {
    const nextEntry = { attempts: 1, resetAt: now + config.windowMs }
    store.set(key, nextEntry)
    return {
      allowed: true,
      remainingAttempts: config.maxAttempts - 1,
      retryAfterMs: 0,
    }
  }

  if (entry.attempts >= config.maxAttempts) {
    return toRateLimitResult(entry, now, config.maxAttempts)
  }

  entry.attempts += 1
  return toRateLimitResult(entry, now, config.maxAttempts)
}

function resetLocalRateLimit(key: string): void {
  store.delete(key)
}

function mapDbRateLimitResult(row: DbRateLimitRow | null | undefined): RateLimitResult | null {
  if (!row) {
    return null
  }

  return {
    allowed: Boolean(row.allowed),
    remainingAttempts: Number(row.remaining_attempts ?? 0),
    retryAfterMs: Number(row.retry_after_ms ?? 0),
  }
}

async function checkDbRateLimit(
  key: string,
  action: 'peek' | 'increment' | 'reset',
  options?: RateLimitOptions,
): Promise<RateLimitResult | null> {
  try {
    const config = getRateLimitConfig(options)
    const db = createServerClient()
    const { data, error } = await db.rpc('check_rate_limit', {
      p_key: key,
      p_max_attempts: config.maxAttempts,
      p_window_seconds: config.windowSeconds,
      p_increment: action === 'increment',
      p_reset: action === 'reset',
    })

    if (error) {
      console.warn('rateLimiter.dbFallback', error.message)
      return null
    }

    const row = Array.isArray(data) ? data[0] : data
    return mapDbRateLimitResult(row as DbRateLimitRow | null)
  } catch (error) {
    console.warn('rateLimiter.localFallback', error)
    return null
  }
}

export async function checkRateLimit(key: string, options?: RateLimitOptions): Promise<RateLimitResult> {
  return await checkDbRateLimit(key, 'increment', options) ?? checkLocalRateLimit(key, options)
}

export async function peekRateLimit(key: string, options?: RateLimitOptions): Promise<RateLimitResult> {
  return await checkDbRateLimit(key, 'peek', options) ?? peekLocalRateLimit(key, options)
}

export async function recordRateLimitFailure(key: string, options?: RateLimitOptions): Promise<RateLimitResult> {
  return await checkDbRateLimit(key, 'increment', options) ?? recordLocalRateLimitFailure(key, options)
}

export async function resetRateLimit(key: string, options?: RateLimitOptions): Promise<void> {
  resetLocalRateLimit(key)
  await checkDbRateLimit(key, 'reset', options)
}

function normalizeIpCandidate(value: string | null): string | null {
  if (!value) {
    return null
  }

  const candidate = value.split(',')[0]?.trim()
  if (!candidate) {
    return null
  }

  return /^[a-fA-F0-9:.]+$/.test(candidate) ? candidate : null
}

export function getClientIp(req: { headers: { get: (key: string) => string | null } }): string {
  return (
    normalizeIpCandidate(req.headers.get('x-vercel-forwarded-for')) ??
    normalizeIpCandidate(req.headers.get('x-forwarded-for')) ??
    normalizeIpCandidate(req.headers.get('x-real-ip')) ??
    'unknown'
  )
}
