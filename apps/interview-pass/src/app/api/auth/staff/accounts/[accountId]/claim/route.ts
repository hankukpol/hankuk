import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { claimStaffAccountSharedAuth } from '@/lib/auth/staff-accounts'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(128),
})

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ accountId: string }> },
) {
  const guard = await requireAdminApi(req)
  if (guard) return guard

  const featureError = await requireAppFeature('admin_access_management_enabled')
  if (featureError) return featureError

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '올바른 이메일과 6자 이상 비밀번호를 입력해 주세요.' },
      { status: 400 },
    )
  }

  try {
    const division = await getServerTenantType()
    const { accountId } = await context.params
    const account = await claimStaffAccountSharedAuth({
      division,
      accountId,
      email: parsed.data.email,
      password: parsed.data.password,
    })

    return NextResponse.json({ account })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '직원 공통 인증 계정을 연결하지 못했습니다.' },
      { status: 400 },
    )
  }
}
