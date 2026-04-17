import { NextRequest, NextResponse } from 'next/server'
import { handleRouteError } from '@/lib/api/error-response'
import { signJwt } from '@/lib/auth/jwt'
import { createOperatorSession } from '@/lib/auth/operator-sessions'
import {
  setBranchAdminSessionCookie,
  setBranchStaffSessionCookie,
  setSuperAdminSessionCookie,
} from '@/lib/auth/session-cookies'
import { getOperatorAccountWithMembershipsById } from '@/lib/branch-ops'
import { withTenantPrefix } from '@/lib/tenant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isDevEnabled() {
  return process.env.NODE_ENV !== 'production'
}

export async function POST(req: NextRequest) {
  if (!isDevEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const formData = await req.formData().catch(() => null)
  const accountId = Number(formData?.get('accountId'))
  const membershipId = Number(formData?.get('membershipId'))

  if (!Number.isFinite(accountId) || !Number.isFinite(membershipId) || accountId <= 0 || membershipId <= 0) {
    return NextResponse.json({ error: 'accountId/membershipId가 올바르지 않습니다.' }, { status: 400 })
  }

  try {
    const account = await getOperatorAccountWithMembershipsById(accountId)
    if (!account || !account.is_active) {
      return NextResponse.json({ error: '계정을 찾을 수 없습니다.' }, { status: 404 })
    }

    const membership = account.memberships.find((item) => item.id === membershipId)
    if (!membership || !membership.is_active) {
      return NextResponse.json({ error: '멤버십을 찾을 수 없습니다.' }, { status: 404 })
    }
    if (membership.role !== 'SUPER_ADMIN' && membership.branch?.is_active === false) {
      return NextResponse.json({ error: '지점이 비활성화되어 있습니다.' }, { status: 403 })
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

    const { role, sub, iat, exp, ...claims } = sessionPayload
    void iat
    void exp
    const token = await signJwt(role, sub, claims)

    const destination =
      membership.role === 'SUPER_ADMIN'
        ? '/super-admin'
        : membership.role === 'STAFF'
          ? withTenantPrefix('/scan', branchSlug ?? 'police')
          : withTenantPrefix('/dashboard', branchSlug ?? 'police')

    const response = NextResponse.redirect(new URL(destination, req.nextUrl.origin), 303)

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
      'auth.adminDevLogin.POST',
      '개발용 바로 로그인 처리 중 문제가 발생했습니다.',
      error,
    )
  }
}
