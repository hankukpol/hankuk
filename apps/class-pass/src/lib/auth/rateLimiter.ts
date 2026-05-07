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

type DbRateLimitRow = {
  allowed: boolean
  remaining_attempts: number
  retry_after_ms: number
}

const store = new Map<string, RateLimitEntry>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000
const WINDOW_SECONDS = WINDOW_MS / 1000

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

function toRateLimitResult(entry: RateLimitEntry | null, now: number): RateLimitResult {
  if (!entry) {
    return {
      allowed: true,
      remainingAttempts: MAX_ATTEMPTS,
      retryAfterMs: 0,
    }
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterMs: Math.max(entry.resetAt - now, 0),
    }
  }

  return {
    allowed: true,
    remainingAttempts: Math.max(MAX_ATTEMPTS - entry.attempts, 0),
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

function checkLocalRateLimit(key: string): RateLimitResult {
  const now = Date.now()
  const entry = getActiveEntry(key, now)

  if (!entry) {
    const nextEntry = { attempts: 1, resetAt: now + WINDOW_MS }
    store.set(key, nextEntry)
    return {
      allowed: true,
      remainingAttempts: MAX_ATTEMPTS - 1,
      retryAfterMs: 0,
    }
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    return toRateLimitResult(entry, now)
  }

  entry.attempts += 1
  return {
    allowed: true,
    remainingAttempts: Math.max(MAX_ATTEMPTS - entry.attempts, 0),
    retryAfterMs: 0,
  }
}

function peekLocalRateLimit(key: string): RateLimitResult {
  const now = Date.now()
  return toRateLimitResult(getActiveEntry(key, now), now)
}

function recordLocalRateLimitFailure(key: string): RateLimitResult {
  const now = Date.now()
  const entry = getActiveEntry(key, now)

  if (!entry) {
    const nextEntry = { attempts: 1, resetAt: now + WINDOW_MS }
    store.set(key, nextEntry)
    return {
      allowed: true,
      remainingAttempts: MAX_ATTEMPTS - 1,
      retryAfterMs: 0,
    }
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    return toRateLimitResult(entry, now)
  }

  entry.attempts += 1
  return toRateLimitResult(entry, now)
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
): Promise<RateLimitResult | null> {
  try {
    const db = createServerClient()
    const { data, error } = await db.rpc('check_rate_limit', {
      p_key: key,
      p_max_attempts: MAX_ATTEMPTS,
      p_window_seconds: WINDOW_SECONDS,
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

export async function checkRateLimit(key: string): Promise<RateLimitResult> {
  return await checkDbRateLimit(key, 'increment') ?? checkLocalRateLimit(key)
}

export async function peekRateLimit(key: string): Promise<RateLimitResult> {
  return await checkDbRateLimit(key, 'peek') ?? peekLocalRateLimit(key)
}

export async function recordRateLimitFailure(key: string): Promise<RateLimitResult> {
  return await checkDbRateLimit(key, 'increment') ?? recordLocalRateLimitFailure(key)
}

export async function resetRateLimit(key: string): Promise<void> {
  resetLocalRateLimit(key)
  await checkDbRateLimit(key, 'reset')
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
