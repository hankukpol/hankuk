import { NextResponse } from 'next/server'
import { requirePortalApiSuperAdmin } from '@/lib/portal-route-auth'
import { deactivateStaff } from '@/lib/staff-management'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePortalApiSuperAdmin()
  if (auth.response || !auth.session) {
    return auth.response
  }

  const { id } = await params

  try {
    await deactivateStaff({
      userId: id,
      actorUserId: auth.session.userId,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[portal-staff] failed to deactivate staff.', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '직원을 비활성화하지 못했습니다.' },
      { status: 500 },
    )
  }
}
