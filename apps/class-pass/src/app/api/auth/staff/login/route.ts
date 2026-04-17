import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { STAFF_TTL_SEC, cookieOptions, getBranchStaffCookieName, signJwt } from '@/lib/auth/jwt'
import { createOperatorSession } from '@/lib/auth/operator-sessions'
import { getPinHash, verifyPin } from '@/lib/auth/pin'
import { validateSameOriginRequest } from '@/lib/auth/request-origin'
import { checkRateLimit, getClientIp, resetRateLimit } from '@/lib/auth/rateLimiter'
import { getSessionVersion } from '@/lib/auth/session-version'
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
  const rateLimit = checkRateLimit(`staff:${ip}`)

  if (!rateLimit.allowed) {
    const retryAfterSec = Math.ceil(rateLimit.retryAfterMs / 1000)
    return NextResponse.json(
      { error: `Too many login attempts. Try again in ${retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Staff PIN is required.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const loginId = parsed.data.loginId.trim()

  if (loginId) {
    const operatorAccount = await getOperatorAccountWithMembershipsByLoginId(loginId)
    const operatorMembership = operatorAccount?.memberships.find(
      (membership) =>
        membership.role === 'STAFF'
        && membership.is_active
        && membership.branch?.slug === division,
    )

    if (operatorAccount && operatorMembership) {
      if (!operatorAccount.is_active || operatorMembership.branch?.is_active === false) {
        return NextResponse.json({ error: 'This branch is not active.' }, { status: 403 })
      }

      if (!(await verifyOperatorPin(parsed.data.pin, operatorAccount.pin_hash))) {
        return NextResponse.json({ error: 'Invalid staff credentials.' }, { status: 401 })
      }

      resetRateLimit(`staff:${ip}`)
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

    const storedAccount = await findStoredStaffAccount(loginId)
    if (storedAccount) {
      if (!(await verifyPin(parsed.data.pin, storedAccount.pin_hash))) {
        return NextResponse.json({ error: 'Invalid staff credentials.' }, { status: 401 })
      }

      resetRateLimit(`staff:${ip}`)
      const sessionId = randomUUID()
      const sessionVersion = await getSessionVersion('staff')
      const token = await signJwt('staff', sessionId, {
        division,
        authMethod: 'staff_pin',
        staffName: storedAccount.name,
        sessionVersion,
      })

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

    return NextResponse.json({ error: 'Invalid staff credentials.' }, { status: 401 })
  }

  const hash = await getPinHash('staff_pin_hash')
  if (!hash) {
    return NextResponse.json(
      { error: loginId ? 'Invalid staff credentials.' : 'Staff PIN is not configured yet.' },
      { status: loginId ? 401 : 503 },
    )
  }

  if (!(await verifyPin(parsed.data.pin, hash))) {
    return NextResponse.json({ error: 'Invalid staff PIN.' }, { status: 401 })
  }

  resetRateLimit(`staff:${ip}`)
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
