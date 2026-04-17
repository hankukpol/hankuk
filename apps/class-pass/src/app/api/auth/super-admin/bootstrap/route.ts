import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { validateSameOriginRequest } from '@/lib/auth/request-origin'
import {
  listOperatorAccounts,
  upsertOperatorAccount,
} from '@/lib/branch-ops'

const schema = z.object({
  loginId: z.string().min(3).max(50),
  displayName: z.string().min(1).max(80).default('Class Pass Super Admin'),
  sharedUserId: z.string().uuid(),
})

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
    shared_user_id: parsed.data.sharedUserId,
    memberships: [{ role: 'SUPER_ADMIN' }],
  })

  return NextResponse.json(
    {
      success: true,
      account: {
        id: account.id,
        login_id: account.login_id,
        shared_user_id: account.shared_user_id,
      },
    },
    { status: 201 },
  )
}
