import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { createStaffAccount, listStaffAccounts } from '@/lib/auth/staff-accounts'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { getServerTenantType } from '@/lib/tenant.server'

const createSchema = z.object({
  loginId: z.string().trim().min(3).max(64).regex(/^[a-z0-9._-]+$/),
  displayName: z.string().trim().min(2).max(50),
  pin: z.string().min(4).max(20),
  note: z.string().trim().max(200).optional(),
})

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req)
  if (guard) return guard

  const featureError = await requireAppFeature('admin_access_management_enabled')
  if (featureError) return featureError

  try {
    const division = await getServerTenantType()
    const accounts = await listStaffAccounts(division)
    return NextResponse.json({ accounts })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '직원 계정 목록을 불러오지 못했습니다.' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req)
  if (guard) return guard

  const featureError = await requireAppFeature('admin_access_management_enabled')
  if (featureError) return featureError

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '직원 로그인 아이디, 이름, PIN 형식을 확인해 주세요.' },
      { status: 400 },
    )
  }

  try {
    const division = await getServerTenantType()
    const account = await createStaffAccount({
      division,
      loginId: parsed.data.loginId,
      displayName: parsed.data.displayName,
      pin: parsed.data.pin,
      note: parsed.data.note,
    })
    return NextResponse.json({ account }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '직원 계정을 만들지 못했습니다.' },
      { status: 400 },
    )
  }
}
