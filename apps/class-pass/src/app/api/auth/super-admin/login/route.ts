import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { signJwt } from '@/lib/auth/jwt'
import { createOperatorSession } from '@/lib/auth/operator-sessions'
import { setSuperAdminSessionCookie } from '@/lib/auth/session-cookies'
import { validateSameOriginRequest } from '@/lib/auth/request-origin'
import {
  getOperatorAccountWithMembershipsByLoginId,
  verifyOperatorPin,
} from '@/lib/branch-ops'

const schema = z.object({
  loginId: z.string().min(1),
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

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '로그인 정보가 올바르지 않습니다.' },
      { status: 400 },
    )
  }

  const account = await getOperatorAccountWithMembershipsByLoginId(parsed.data.loginId.trim())
  const membership = account?.memberships.find(
    (item) => item.role === 'SUPER_ADMIN' && item.is_active,
  )
  if (!account || !membership || !account.is_active) {
    return NextResponse.json(
      { error: '슈퍼 관리자 계정을 찾을 수 없습니다.' },
      { status: 404 },
    )
  }

  const pinValid = await verifyOperatorPin(parsed.data.pin, account.pin_hash)
  if (!pinValid) {
    return NextResponse.json(
      { error: '로그인 정보가 일치하지 않습니다.' },
      { status: 401 },
    )
  }

  const sessionPayload = await createOperatorSession(req, {
    accountId: account.id,
    membershipId: membership.id,
    branchSlug: null,
    role: 'SUPER_ADMIN',
    credentialVersion: account.credential_version,
    loginId: account.login_id,
    displayName: account.display_name,
    sharedUserId: account.shared_user_id,
  })
  const { role, sub, claims } = toClaims(sessionPayload)
  const token = await signJwt(role, sub, claims)

  const response = NextResponse.json({ success: true })
  setSuperAdminSessionCookie(response, token)
  return response
}
