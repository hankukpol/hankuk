import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  clearPortalLoginFailures,
  getPortalLoginClientIp,
  getPortalLoginRateLimitKey,
  getPortalLoginRateLimitState,
  recordPortalLoginFailure,
} from '@/lib/login-rate-limit'
import { signPortalSession, portalCookieOptions, PORTAL_SESSION_COOKIE } from '@/lib/portal-session'
import { createAnonSupabaseClient } from '@/lib/supabase'

const loginSchema = z.object({
  email: z.string().email('올바른 이메일 형식이 아닙니다.'),
  password: z.string().min(1, '비밀번호를 입력해 주세요.'),
})

function isJsonRequest(request: NextRequest) {
  return request.headers.get('content-type')?.includes('application/json') ?? false
}

function normalizeRedirectTarget(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  if (!value.startsWith('/') || value.startsWith('//')) {
    return null
  }

  return value
}

async function readLoginBody(request: NextRequest) {
  if (isJsonRequest(request)) {
    return request.json().catch(() => null)
  }

  const formData = await request.formData().catch(() => null)
  if (!formData) {
    return null
  }

  return {
    email: typeof formData.get('email') === 'string' ? formData.get('email') : '',
    password: typeof formData.get('password') === 'string' ? formData.get('password') : '',
    redirect: typeof formData.get('redirect') === 'string' ? formData.get('redirect') : '',
  }
}

function buildLoginRedirect(request: NextRequest, error?: string, redirectTarget?: string | null) {
  const url = new URL('/login', request.url)
  if (error) {
    url.searchParams.set('error', error)
  }

  if (redirectTarget) {
    url.searchParams.set('redirect', redirectTarget)
  }

  return url
}

function jsonOrRedirect(
  request: NextRequest,
  input: {
    status: number
    error?: string
    retryAfterSec?: number
    success?: boolean
    redirectTarget?: string | null
  },
) {
  if (isJsonRequest(request)) {
    const headers: HeadersInit = {}
    if (input.retryAfterSec) {
      headers['Retry-After'] = String(input.retryAfterSec)
    }

    return NextResponse.json(
      input.success ? { success: true } : { error: input.error ?? '로그인에 실패했습니다.' },
      { status: input.status, headers },
    )
  }

  if (input.success) {
    return NextResponse.redirect(new URL(input.redirectTarget ?? '/', request.url), 303)
  }

  const response = NextResponse.redirect(
    buildLoginRedirect(
      request,
      input.status === 429
        ? 'rate_limited'
        : input.status === 401
          ? 'invalid_credentials'
          : 'invalid_input',
      input.redirectTarget,
    ),
    303,
  )

  if (input.retryAfterSec) {
    response.headers.set('Retry-After', String(input.retryAfterSec))
  }

  return response
}

export async function POST(request: NextRequest) {
  const body = await readLoginBody(request)
  const redirectTarget = normalizeRedirectTarget(body?.redirect)
  const rateLimitKey = getPortalLoginRateLimitKey(
    typeof body?.email === 'string' ? body.email : '',
    getPortalLoginClientIp(request.headers),
  )
  const rateLimitState = getPortalLoginRateLimitState(rateLimitKey)

  if (!rateLimitState.allowed) {
    return jsonOrRedirect(request, {
      status: 429,
      error: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
      retryAfterSec: rateLimitState.retryAfterSec,
      redirectTarget,
    })
  }

  const parsed = loginSchema.safeParse(body)

  if (!parsed.success) {
    return jsonOrRedirect(request, {
      status: 400,
      error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요.',
      redirectTarget,
    })
  }

  const supabase = createAnonSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error || !data.user) {
    recordPortalLoginFailure(rateLimitKey)
    return jsonOrRedirect(request, {
      status: 401,
      error: '이메일과 비밀번호를 확인해 주세요.',
      redirectTarget,
    })
  }

  clearPortalLoginFailures(rateLimitKey)

  const token = await signPortalSession({
    userId: data.user.id,
    email: data.user.email ?? parsed.data.email,
    fullName:
      typeof data.user.user_metadata?.full_name === 'string'
        ? data.user.user_metadata.full_name
        : null,
  })

  const response = jsonOrRedirect(request, { status: 200, success: true, redirectTarget })
  response.cookies.set(PORTAL_SESSION_COOKIE, token, portalCookieOptions())
  return response
}
