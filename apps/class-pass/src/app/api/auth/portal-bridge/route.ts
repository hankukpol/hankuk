import { NextRequest, NextResponse } from 'next/server'
import { HANKUK_APP_KEYS, HANKUK_SERVICE_CONFIG } from '@hankuk/config'
import { handleRouteError } from '@/lib/api/error-response'
import { signJwt } from '@/lib/auth/jwt'
import { createOperatorSession } from '@/lib/auth/operator-sessions'
import {
  setBranchAdminSessionCookie,
  setBranchStaffSessionCookie,
  setSuperAdminSessionCookie,
} from '@/lib/auth/session-cookies'
import { getOperatorAccountBySharedUser } from '@/lib/branch-ops'
import { consumePortalLaunchToken } from '@/lib/portal-launch'
import { withTenantPrefix } from '@/lib/tenant'

function toClaims(payload: Awaited<ReturnType<typeof createOperatorSession>>) {
  const { role, sub, iat, exp, ...claims } = payload
  void iat
  void exp
  return { role, sub, claims }
}

function normalizeTargetPath(targetPath: string | null | undefined, fallback: string) {
  if (!targetPath || !targetPath.startsWith('/') || targetPath.startsWith('//')) {
    return fallback
  }

  return targetPath
}

function getAllowedPortalOrigins() {
  const allowedOrigins = new Set<string>()
  const candidates = [
    process.env.PORTAL_ALLOWED_ORIGINS,
    process.env.PORTAL_URL,
    process.env.PORTAL_ORIGIN,
    HANKUK_SERVICE_CONFIG[HANKUK_APP_KEYS.PORTAL].productionUrl,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean)

  for (const candidate of candidates) {
    try {
      allowedOrigins.add(new URL(candidate).origin)
    } catch {
      continue
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.add('http://localhost:3000')
    allowedOrigins.add('http://127.0.0.1:3000')
    allowedOrigins.add('http://localhost:3001')
    allowedOrigins.add('http://127.0.0.1:3001')
  }

  return allowedOrigins
}

function getRequestOrigin(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin) {
    return origin
  }

  const referer = request.headers.get('referer')
  if (!referer) {
    return null
  }

  try {
    return new URL(referer).origin
  } catch {
    return null
  }
}

function isAllowedPortalOrigin(request: NextRequest) {
  const requestOrigin = getRequestOrigin(request)
  if (!requestOrigin) {
    return process.env.NODE_ENV !== 'production'
  }

  return getAllowedPortalOrigins().has(requestOrigin)
}

export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null)
  const launchToken = String(formData?.get('launchToken') || '').trim()
  if (!launchToken) {
    return NextResponse.json({ error: '포털 실행 토큰이 필요합니다.' }, { status: 400 })
  }

  if (!isAllowedPortalOrigin(req)) {
    return NextResponse.json({ error: 'Portal origin is not allowed.' }, { status: 403 })
  }

  try {
    const consumed = await consumePortalLaunchToken(launchToken)
    if (!consumed) {
      return NextResponse.json(
        { error: '포털 실행 토큰이 유효하지 않거나 이미 사용되었거나 만료되었습니다.' },
        { status: 401 },
      )
    }

    if (consumed.target_role === 'assistant') {
      return NextResponse.json(
        { error: 'class-pass 포털 이동은 assistant 역할을 지원하지 않습니다.' },
        { status: 403 },
      )
    }

    const account = await getOperatorAccountBySharedUser(consumed.user_id)
    if (!account || !account.is_active) {
      return NextResponse.json(
        { error: '연결된 운영 계정을 찾을 수 없습니다.' },
        { status: 403 },
      )
    }

    const membership = account.memberships.find((item) => {
      if (!item.is_active) return false
      if (consumed.target_role === 'super_admin') {
        return item.role === 'SUPER_ADMIN'
      }
      if (!consumed.division_slug || item.branch?.slug !== consumed.division_slug) {
        return false
      }
      if (consumed.target_role === 'admin') {
        return item.role === 'BRANCH_ADMIN'
      }
      return item.role === 'STAFF'
    })

    if (!membership) {
      return NextResponse.json(
        { error: '요청한 역할에 맞는 권한을 찾을 수 없습니다.' },
        { status: 403 },
      )
    }

    const branchSlug = membership.branch?.slug ?? null
    const sessionPayload = await createOperatorSession(req, {
      accountId: account.id,
      membershipId: membership.id,
      branchSlug,
      role: membership.role,
      credentialVersion: account.credential_version,
      loginId: account.login_id,
      displayName: account.display_name,
      sharedUserId: account.shared_user_id,
    })
    const { role, sub, claims } = toClaims(sessionPayload)
    const token = await signJwt(role, sub, claims)

    const fallbackPath =
      membership.role === 'SUPER_ADMIN'
        ? '/super-admin'
        : membership.role === 'STAFF'
          ? withTenantPrefix('/scan', branchSlug ?? 'police')
          : withTenantPrefix('/dashboard', branchSlug ?? 'police')
    const destination = normalizeTargetPath(consumed.target_path, fallbackPath)
    const redirectUrl = new URL(destination, req.nextUrl.origin)
    const response = NextResponse.redirect(redirectUrl)

    if (membership.role === 'SUPER_ADMIN') {
      setSuperAdminSessionCookie(response, token)
    } else if (membership.role === 'STAFF' && branchSlug) {
      setBranchStaffSessionCookie(response, branchSlug, token)
    } else if (branchSlug) {
      setBranchAdminSessionCookie(response, branchSlug, token)
    }

    return response
  } catch (error) {
    return handleRouteError(
      'auth.portalBridge.POST',
      '포털 이동 로그인 처리 중 문제가 발생했습니다. 다시 시도해 주세요.',
      error,
    )
  }
}
