import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  ADMIN_TTL_SEC,
  STAFF_TTL_SEC,
  cookieOptions,
  getBranchAdminCookieName,
  getBranchStaffCookieName,
  signJwt,
} from '@/lib/auth/jwt'
import { createOperatorSession } from '@/lib/auth/operator-sessions'
import { getAdminId, getPinHash, verifyPin } from '@/lib/auth/pin'
import { validateSameOriginRequest } from '@/lib/auth/request-origin'
import { checkRateLimit, getClientIp, resetRateLimit } from '@/lib/auth/rateLimiter'
import { getSessionVersion } from '@/lib/auth/session-version'
import { createStoredStaffSessionClaims } from '@/lib/auth/stored-staff-session'
import {
  getOperatorAccountWithMembershipsByLoginId,
  verifyOperatorPin,
} from '@/lib/branch-ops'
import { findStoredStaffAccount } from '@/lib/staff-accounts'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  loginId: z.string().optional().default(''),
  pin: z.string().min(1),
})

function toClaims(payload: Awaited<ReturnType<typeof createOperatorSession>>) {
  const { role, sub, iat, exp, ...claims } = payload
  void iat
  void exp
  return { role, sub, claims }
}

export async function POST(req: NextRequest) {
  const originError = validateSameOriginRequest(req)
  if (originError) {
    return originError
  }

  const ip = getClientIp(req)
  const rateLimit = await checkRateLimit(`staff:${ip}`)

  if (!rateLimit.allowed) {
    const retryAfterSec = Math.ceil(rateLimit.retryAfterMs / 1000)
    return NextResponse.json(
      { error: `로그인 시도가 너무 많습니다. ${retryAfterSec}초 후 다시 시도해 주세요.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '직원 PIN을 입력해 주세요.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const loginId = parsed.data.loginId.trim()

  if (loginId) {
    const operatorAccount = await getOperatorAccountWithMembershipsByLoginId(loginId)
    const operatorAdminMembership = operatorAccount?.memberships.find(
      (membership) =>
        membership.role === 'BRANCH_ADMIN'
        && membership.is_active
        && membership.branch?.slug === division,
    )

    if (operatorAccount && operatorAdminMembership) {
      if (!operatorAccount.is_active || operatorAdminMembership.branch?.is_active === false) {
        return NextResponse.json({ error: '사용이 중지된 지점입니다. 관리자에게 문의해 주세요.' }, { status: 403 })
      }

      if (!(await verifyOperatorPin(parsed.data.pin, operatorAccount.pin_hash))) {
        return NextResponse.json({ error: '관리자 로그인 정보가 올바르지 않습니다. 다시 확인해 주세요.' }, { status: 401 })
      }

      await resetRateLimit(`staff:${ip}`)
      const sessionPayload = await createOperatorSession(req, {
        accountId: operatorAccount.id,
        membershipId: operatorAdminMembership.id,
        branchSlug: division,
        role: 'BRANCH_ADMIN',
        credentialVersion: operatorAccount.credential_version,
        loginId: operatorAccount.login_id,
        displayName: operatorAccount.display_name,
        sharedUserId: operatorAccount.shared_user_id,
      })
      const { role, sub, claims } = toClaims(sessionPayload)
      const token = await signJwt(role, sub, claims)

      const response = NextResponse.json({
        success: true,
        division,
        role: 'admin',
        authMode: 'operator',
        adminId: operatorAccount.login_id,
      })
      response.cookies.set(getBranchAdminCookieName(division), token, cookieOptions(ADMIN_TTL_SEC))
      return response
    }

    const operatorMembership = operatorAccount?.memberships.find(
      (membership) =>
        membership.role === 'STAFF'
        && membership.is_active
        && membership.branch?.slug === division,
    )

    if (operatorAccount && operatorMembership) {
      if (!operatorAccount.is_active || operatorMembership.branch?.is_active === false) {
        return NextResponse.json({ error: '사용이 중지된 지점입니다. 관리자에게 문의해 주세요.' }, { status: 403 })
      }

      if (!(await verifyOperatorPin(parsed.data.pin, operatorAccount.pin_hash))) {
        return NextResponse.json({ error: '직원 로그인 정보가 올바르지 않습니다. 다시 확인해 주세요.' }, { status: 401 })
      }

      await resetRateLimit(`staff:${ip}`)
      const sessionPayload = await createOperatorSession(req, {
        accountId: operatorAccount.id,
        membershipId: operatorMembership.id,
        branchSlug: division,
        role: 'STAFF',
        credentialVersion: operatorAccount.credential_version,
        loginId: operatorAccount.login_id,
        displayName: operatorAccount.display_name,
        sharedUserId: operatorAccount.shared_user_id,
      })
      const { role, sub, claims } = toClaims(sessionPayload)
      const token = await signJwt(role, sub, claims)

      const response = NextResponse.json({
        success: true,
        division,
        role: 'staff',
        authMode: 'operator',
        staffName: operatorAccount.display_name,
      })
      response.cookies.set(getBranchStaffCookieName(division), token, cookieOptions(STAFF_TTL_SEC))
      return response
    }

    let legacyAdminId = ''
    try {
      legacyAdminId = await getAdminId()
    } catch (error) {
      console.warn('[staff.login] Failed to load legacy admin ID.', error)
    }

    if (legacyAdminId && loginId === legacyAdminId) {
      const adminHash = await getPinHash('admin_pin_hash')
      if (!adminHash) {
        return NextResponse.json({ error: '관리자 PIN이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.' }, { status: 503 })
      }

      if (!(await verifyPin(parsed.data.pin, adminHash))) {
        return NextResponse.json({ error: '관리자 로그인 정보가 올바르지 않습니다. 다시 확인해 주세요.' }, { status: 401 })
      }

      await resetRateLimit(`staff:${ip}`)
      const sessionId = randomUUID()
      const sessionVersion = await getSessionVersion('admin')
      const token = await signJwt('admin', sessionId, {
        division,
        adminId: legacyAdminId,
        authMethod: 'admin_pin',
        sessionVersion,
      })

      const response = NextResponse.json({
        success: true,
        division,
        role: 'admin',
        authMode: 'admin_pin',
        adminId: legacyAdminId,
      })
      response.cookies.set(getBranchAdminCookieName(division), token, cookieOptions(ADMIN_TTL_SEC))
      return response
    }

    const storedAccount = await findStoredStaffAccount(loginId)
    if (storedAccount) {
      if (!(await verifyPin(parsed.data.pin, storedAccount.pin_hash))) {
        return NextResponse.json({ error: '직원 로그인 정보가 올바르지 않습니다. 다시 확인해 주세요.' }, { status: 401 })
      }

      await resetRateLimit(`staff:${ip}`)
      const sessionId = randomUUID()
      const sessionVersion = await getSessionVersion('staff')
      const token = await signJwt(
        'staff',
        sessionId,
        createStoredStaffSessionClaims(storedAccount, division, sessionId, sessionVersion),
      )

      const response = NextResponse.json({
        success: true,
        division,
        role: 'staff',
        authMode: 'account',
        staffName: storedAccount.name,
      })
      response.cookies.set(getBranchStaffCookieName(division), token, cookieOptions(STAFF_TTL_SEC))
      return response
    }

    return NextResponse.json({ error: '직원 로그인 정보가 올바르지 않습니다. 다시 확인해 주세요.' }, { status: 401 })
  }

  const hash = await getPinHash('staff_pin_hash')
  if (!hash) {
    return NextResponse.json(
      { error: loginId ? '직원 로그인 정보가 올바르지 않습니다. 다시 확인해 주세요.' : 'Staff PIN is not configured yet.' },
      { status: loginId ? 401 : 503 },
    )
  }

  if (!(await verifyPin(parsed.data.pin, hash))) {
    return NextResponse.json({ error: '직원 PIN이 올바르지 않습니다. 다시 확인해 주세요.' }, { status: 401 })
  }

  await resetRateLimit(`staff:${ip}`)
  const sessionId = randomUUID()
  const sessionVersion = await getSessionVersion('staff')
  const token = await signJwt('staff', sessionId, {
    division,
    authMethod: 'staff_pin',
    sessionVersion,
  })

  const response = NextResponse.json({ success: true, division, role: 'staff', authMode: 'shared_pin' })
  response.cookies.set(getBranchStaffCookieName(division), token, cookieOptions(STAFF_TTL_SEC))
  return response
}
