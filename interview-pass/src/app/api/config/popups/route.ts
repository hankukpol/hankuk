import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag, unstable_cache } from 'next/cache'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { verifyJwt, ADMIN_COOKIE } from '@/lib/auth/jwt'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { getServerTenantType } from '@/lib/tenant.server'
import type { TenantType } from '@/lib/tenant'

const POPUP_KEYS = ['notice', 'refund_policy'] as const

function getScopedPopupKey(division: TenantType, popupKey: string) {
  return `${division}::${popupKey}`
}

function normalizePopupRows(
  rows: Array<{
    popup_key: string
    title: string
    body: string
    is_active: boolean
    updated_at: string
  }>,
  division: TenantType,
) {
  const rowMap = new Map(rows.map((row) => [row.popup_key, row]))

  return POPUP_KEYS.map((popupKey) => {
    const row = rowMap.get(getScopedPopupKey(division, popupKey)) ?? rowMap.get(popupKey)

    return {
      popup_key: popupKey,
      title: row?.title ?? (popupKey === 'notice' ? '공지사항' : '환불 규정'),
      body: row?.body ?? '',
      is_active: row?.is_active ?? false,
      updated_at: row?.updated_at ?? new Date(0).toISOString(),
    }
  })
}

const getPopups = unstable_cache(
  async (division: TenantType) => {
    const db = createServerClient()
    const { data } = await db
      .from('popup_content')
      .select('*')
      .in('popup_key', [
        ...POPUP_KEYS,
        ...POPUP_KEYS.map((popupKey) => getScopedPopupKey(division, popupKey)),
      ])
      .order('popup_key')

    return normalizePopupRows((data ?? []) as Array<{
      popup_key: string
      title: string
      body: string
      is_active: boolean
      updated_at: string
    }>, division)
  },
  ['popups-all'],
  { tags: ['popups'], revalidate: 600 },
)

const patchSchema = z.object({
  popup_key: z.string(),
  title: z.string().max(100).optional(),
  body: z.string().max(5000).optional(),
  is_active: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  const division = await getServerTenantType()
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  const payload = token ? await verifyJwt(token) : null
  const rows = await getPopups(division)
  const data = payload?.role === 'admin' ? rows : rows.filter((row) => row.is_active)
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  const payload = token ? await verifyJwt(token) : null
  if (!payload || payload.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const featureError = await requireAppFeature('admin_popup_management_enabled')
  if (featureError) {
    return featureError
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const scopedPopupKey = getScopedPopupKey(division, parsed.data.popup_key)
  const payloadRow = {
    popup_key: scopedPopupKey,
    title: parsed.data.title ?? '',
    body: parsed.data.body ?? '',
    is_active: parsed.data.is_active ?? false,
    updated_at: new Date().toISOString(),
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('popup_content')
    .upsert(payloadRow)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  revalidateTag('popups')
  return NextResponse.json({
    popup_key: parsed.data.popup_key,
    title: data.title,
    body: data.body,
    is_active: data.is_active,
    updated_at: data.updated_at,
  })
}
