import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { requirePortalApiSuperAdmin } from '@/lib/portal-route-auth'
import { updateStaffMemberships } from '@/lib/staff-management'
import { updateMembershipsSchema } from '@/lib/validations/staff'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePortalApiSuperAdmin()
  if (auth.response || !auth.session) {
    return auth.response
  }

  const { id } = await params

  try {
    const body = await request.json().catch(() => null)
    const parsed = updateMembershipsSchema.parse(body)
    const staff = await updateStaffMemberships({
      userId: id,
      memberships: parsed.memberships,
      actorUserId: auth.session.userId,
    })

    return NextResponse.json(staff)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: '유효하지 않은 입력입니다.', details: error.flatten() },
        { status: 400 },
      )
    }

    console.error('[portal-staff] failed to update staff memberships.', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '직원 권한을 수정하지 못했습니다.' },
      { status: 500 },
    )
  }
}
