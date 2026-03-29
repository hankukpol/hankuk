import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { updateStaffAccount } from '@/lib/auth/staff-accounts'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { getServerTenantType } from '@/lib/tenant.server'

const updateSchema = z.object({
  loginId: z.string().trim().min(3).max(64).regex(/^[a-z0-9._-]+$/).optional(),
  displayName: z.string().trim().min(2).max(50).optional(),
  note: z.string().trim().max(200).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  pin: z.string().min(4).max(20).optional(),
})

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ accountId: string }> },
) {
  const guard = await requireAdminApi(req)
  if (guard) return guard

  const featureError = await requireAppFeature('admin_access_management_enabled')
  if (featureError) return featureError

  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '직원 계정 수정 입력값을 확인해 주세요.' }, { status: 400 })
  }

  try {
    const { accountId } = await context.params
    const division = await getServerTenantType()
    const account = await updateStaffAccount({
      division,
      accountId,
      loginId: parsed.data.loginId,
      displayName: parsed.data.displayName,
      note: parsed.data.note,
      status: parsed.data.status,
      pin: parsed.data.pin,
    })

    return NextResponse.json({ account })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '직원 계정을 수정하지 못했습니다.' },
      { status: 400 },
    )
  }
}
