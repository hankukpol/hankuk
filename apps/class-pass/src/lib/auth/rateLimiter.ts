/**
 * 간단한 메모리 기반 Rate Limiter
 * - 동일 IP에서 MAX_ATTEMPTS 초과 시 차단
 * - WINDOW_MS 경과 후 자동 초기화
 * - 주의: 다중 서버 인스턴스 환경에서는 Redis 같은 외부 스토리지를 사용해야 합니다.
 */

interface RateLimitEntry {
  attempts: number
  resetAt: number
}

interface RateLimitResult {
  allowed: boolean
  remainingAttempts: number
  retryAfterMs: number
}

const store = new Map<string, RateLimitEntry>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000 // 15분

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

// 5분마다 만료된 항목 정리
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

export function checkRateLimit(key: string): RateLimitResult {
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

export function peekRateLimit(key: string): RateLimitResult {
  const now = Date.now()
  return toRateLimitResult(getActiveEntry(key, now), now)
}

export function recordRateLimitFailure(key: string): RateLimitResult {
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

export function resetRateLimit(key: string): void {
  store.delete(key)
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
