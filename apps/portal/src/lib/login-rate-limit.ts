import 'server-only'

const LOGIN_WINDOW_MS = 10 * 60 * 1000
const LOGIN_MAX_FAILURES = 5

type LoginRateLimitEntry = {
  count: number
  resetAt: number
}

declare global {
  var __portalLoginRateLimitStore: Map<string, LoginRateLimitEntry> | undefined
}

function getStore() {
  if (!globalThis.__portalLoginRateLimitStore) {
    globalThis.__portalLoginRateLimitStore = new Map()
  }

  return globalThis.__portalLoginRateLimitStore
}

function getForwardedIp(headerValue: string | null) {
  if (!headerValue) {
    return null
  }

  return headerValue.split(',')[0]?.trim() || null
}

export function getPortalLoginClientIp(headers: Headers) {
  return (
    getForwardedIp(headers.get('cf-connecting-ip')) ||
    getForwardedIp(headers.get('x-real-ip')) ||
    getForwardedIp(headers.get('x-forwarded-for')) ||
    'unknown'
  )
}

export function getPortalLoginRateLimitKey(email: string, ip: string) {
  const normalizedEmail = email.trim().toLowerCase() || 'unknown-email'
  return `${normalizedEmail}:${ip}`
}

export function getPortalLoginRateLimitState(key: string) {
  const now = Date.now()
  const entry = getStore().get(key)
  if (!entry || entry.resetAt <= now) {
    getStore().delete(key)
    return { allowed: true, retryAfterSec: 0 }
  }

  return {
    allowed: entry.count < LOGIN_MAX_FAILURES,
    retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  }
}

export function recordPortalLoginFailure(key: string) {
  const now = Date.now()
  const store = getStore()
  const entry = store.get(key)

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
    return
  }

  store.set(key, {
    count: entry.count + 1,
    resetAt: entry.resetAt,
  })
}

export function clearPortalLoginFailures(key: string) {
  getStore().delete(key)
}
