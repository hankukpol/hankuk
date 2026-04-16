import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { requirePortalApiSuperAdmin } from '@/lib/portal-route-auth'
import { resetStaffPassword } from '@/lib/staff-management'
import { resetPasswordSchema } from '@/lib/validations/staff'

export async function POST(
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
    const parsed = resetPasswordSchema.parse(body)

    await resetStaffPassword({
      userId: id,
      newPassword: parsed.newPassword,
      actorUserId: auth.session.userId,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: '유효하지 않은 입력입니다.', details: error.flatten() },
        { status: 400 },
      )
    }

    console.error('[portal-staff] failed to reset staff password.', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '비밀번호를 변경하지 못했습니다.' },
      { status: 500 },
    )
  }
}
