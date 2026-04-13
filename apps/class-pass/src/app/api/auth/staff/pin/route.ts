import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { hashPin, setPinHash } from '@/lib/auth/pin'
import { rotateSessionVersion } from '@/lib/auth/session-version'

const schema = z.object({
  pin: z.string().min(4).max(20),
})

export async function PATCH(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Staff PIN must be 4-20 characters.' }, { status: 400 })
  }

  await setPinHash('staff_pin_hash', await hashPin(parsed.data.pin))
  await rotateSessionVersion('staff')
  return NextResponse.json({ success: true })
}
