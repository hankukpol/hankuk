import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateSuperAdminRequest } from '@/lib/auth/authenticate'
import { revokeOperatorSessionsForAccount, setOperatorAccountPin } from '@/lib/branch-ops'

const schema = z.object({
  pin: z.string().min(4).max(20),
})

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { error } = await authenticateSuperAdminRequest(req)
  if (error) {
    return error
  }

  const { id } = await context.params
  const accountId = Number(id)
  if (!Number.isFinite(accountId)) {
    return NextResponse.json({ error: '운영자 계정 ID가 올바르지 않습니다.' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'PIN 값이 올바르지 않습니다.' }, { status: 400 })
  }

  await setOperatorAccountPin(accountId, parsed.data.pin)
  await revokeOperatorSessionsForAccount(accountId)
  return NextResponse.json({ success: true })
}
