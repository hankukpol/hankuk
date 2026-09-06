import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
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
  bootstrapToken: z.string().optional(),
})

function isValidBootstrapToken(input: string | null | undefined, expected: string) {
  if (!input) {
    return false
  }

  const inputBuffer = Buffer.from(input)
  const expectedBuffer = Buffer.from(expected)
  return inputBuffer.length === expectedBuffer.length
    && timingSafeEqual(inputBuffer, expectedBuffer)
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

  const bootstrapToken = process.env.SUPER_ADMIN_BOOTSTRAP_TOKEN?.trim()
  if (process.env.NODE_ENV === 'production' && !bootstrapToken) {
    return NextResponse.json(
      { error: '최고 관리자 초기 설정이 준비되지 않았습니다. 서버 설정을 확인해 주세요.' },
      { status: 403 },
    )
  }

  if (
    bootstrapToken
    && !isValidBootstrapToken(
      parsed.data.bootstrapToken ?? req.headers.get('x-hankuk-bootstrap-token'),
      bootstrapToken,
    )
  ) {
    return NextResponse.json({ error: '초기 설정 토큰이 올바르지 않습니다.' }, { status: 403 })
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
