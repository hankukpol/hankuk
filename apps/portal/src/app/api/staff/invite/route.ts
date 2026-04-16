import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { requirePortalApiSuperAdmin } from '@/lib/portal-route-auth'
import { inviteStaff } from '@/lib/staff-management'
import { inviteStaffSchema } from '@/lib/validations/staff'

export async function POST(request: NextRequest) {
  const auth = await requirePortalApiSuperAdmin()
  if (auth.response || !auth.session) {
    return auth.response
  }

  try {
    const body = await request.json().catch(() => null)
    const parsed = inviteStaffSchema.parse(body)
    const result = await inviteStaff({
      ...parsed,
      actorUserId: auth.session.userId,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: '유효하지 않은 입력입니다.', details: error.flatten() },
        { status: 400 },
      )
    }

    if (error instanceof Error && error.message.includes('이미 등록된 이메일')) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }

    console.error('[portal-staff] failed to invite staff.', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '직원 초대에 실패했습니다.' },
      { status: 500 },
    )
  }
}
