import { NextRequest, NextResponse } from 'next/server'
import { hashPin, setPinHash } from '@/lib/auth/pin'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { requireAppFeature } from '@/lib/app-feature-guard'

const schema = z.object({ pin: z.string().min(4).max(20) })

export async function PATCH(req: NextRequest) {
  const guard = await requireAdminApi(req)
  if (guard) return guard

  const featureError = await requireAppFeature('admin_access_management_enabled')
  if (featureError) return featureError

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'PIN은 4~20자리여야 합니다.' }, { status: 400 })
  }

  const hash = await hashPin(parsed.data.pin)
  await setPinHash('admin_pin_hash', hash)
  return NextResponse.json({ ok: true })
}
