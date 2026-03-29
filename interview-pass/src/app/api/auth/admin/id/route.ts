import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAdminId, setAdminId } from '@/lib/auth/pin'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { requireAppFeature } from '@/lib/app-feature-guard'

const schema = z.object({ id: z.string().max(50) })

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req)
  if (guard) return guard
  const id = await getAdminId()
  return NextResponse.json({ id })
}

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
    return NextResponse.json({ error: '아이디는 50자 이하여야 합니다.' }, { status: 400 })
  }

  await setAdminId(parsed.data.id)
  return NextResponse.json({ ok: true })
}
