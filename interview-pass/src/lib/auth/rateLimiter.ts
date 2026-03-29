/**
 * 간단한 인메모리 Rate Limiter
 * - 동일 IP에서 MAX_ATTEMPTS 초과 시 차단
 * - WINDOW_MS 경과 후 자동 초기화
 * - 주의: 다중 서버 인스턴스 환경에서는 Redis 등 외부 스토어를 사용하세요.
 */

interface RateLimitEntry {
  attempts: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000 // 15분

// 5분마다 만료된 항목 정리
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt < now) store.delete(key)
    }
  }, 5 * 60 * 1000)
}

export function checkRateLimit(key: string): {
  allowed: boolean
  remainingAttempts: number
  retryAfterMs: number
} {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    store.set(key, { attempts: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS - 1, retryAfterMs: 0 }
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    return { allowed: false, remainingAttempts: 0, retryAfterMs: entry.resetAt - now }
  }

  entry.attempts++
  return { allowed: true, remainingAttempts: MAX_ATTEMPTS - entry.attempts, retryAfterMs: 0 }
}

export function resetRateLimit(key: string): void {
  store.delete(key)
}

export function getClientIp(req: { headers: { get: (key: string) => string | null } }): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}
