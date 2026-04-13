import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createOperatorSession } from '@/lib/auth/operator-sessions'
import { setSuperAdminSessionCookie } from '@/lib/auth/session-cookies'
import { signJwt } from '@/lib/auth/jwt'
import { validateSameOriginRequest } from '@/lib/auth/request-origin'
import {
  getOperatorAccountWithMembershipsByLoginId,
  listOperatorAccounts,
  upsertOperatorAccount,
} from '@/lib/branch-ops'

const schema = z.object({
  loginId: z.string().min(3).max(50),
  displayName: z.string().min(1).max(80).default('Class Pass Super Admin'),
  pin: z.string().min(4).max(20),
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
      { error: '슈퍼 관리자 정보가 올바르지 않습니다.' },
      { status: 400 },
    )
  }

  const existing = (await listOperatorAccounts()).some((account) =>
    account.memberships.some(
      (membership) => membership.role === 'SUPER_ADMIN' && membership.is_active,
    ),
  )
  if (existing) {
    return NextResponse.json(
      { error: '슈퍼 관리자 설정이 이미 완료되었습니다.' },
      { status: 409 },
    )
  }

  const account = await upsertOperatorAccount({
    login_id: parsed.data.loginId.trim(),
    display_name: parsed.data.displayName.trim(),
    pin: parsed.data.pin,
    memberships: [{ role: 'SUPER_ADMIN' }],
  })

  const loginAccount = await getOperatorAccountWithMembershipsByLoginId(account.login_id)
  const membership = loginAccount?.memberships.find(
    (item) => item.role === 'SUPER_ADMIN' && item.is_active,
  )
  if (!loginAccount || !membership) {
    return NextResponse.json(
      { error: '슈퍼 관리자 계정을 생성하지 못했습니다.' },
      { status: 500 },
    )
  }

  const sessionPayload = await createOperatorSession(req, {
    accountId: loginAccount.id,
    membershipId: membership.id,
    branchSlug: null,
    role: 'SUPER_ADMIN',
    credentialVersion: loginAccount.credential_version,
    loginId: loginAccount.login_id,
    displayName: loginAccount.display_name,
    sharedUserId: loginAccount.shared_user_id,
  })
  const { role, sub, claims } = toClaims(sessionPayload)
  const token = await signJwt(role, sub, claims)

  const response = NextResponse.json({ success: true })
  setSuperAdminSessionCookie(response, token)
  return response
}
