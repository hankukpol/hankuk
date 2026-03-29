import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { invalidateCache } from '@/lib/cache/revalidate'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { withDivisionFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { getServerTenantType } from '@/lib/tenant.server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const featureError = await requireAppFeature('admin_materials_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const division = await getServerTenantType()
  const schema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    is_active: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(99).optional(),
  })

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  const db = createServerClient()
  const { data, error } = await withDivisionFallback(
    () =>
      db
        .from('materials')
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq('id', Number(id))
        .in('division', getScopedDivisionValues(division))
        .select()
        .single(),
    () =>
      db
        .from('materials')
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq('id', Number(id))
        .select()
        .single(),
  )

  if (error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  await invalidateCache('materials')
  return NextResponse.json({ material: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const featureError = await requireAppFeature('admin_materials_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const division = await getServerTenantType()
  const db = createServerClient()
  const { error } = await withDivisionFallback(
    () =>
      db
        .from('materials')
        .delete()
        .eq('id', Number(id))
        .in('division', getScopedDivisionValues(division)),
    () => db.from('materials').delete().eq('id', Number(id)),
  )
  if (error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  await invalidateCache('materials')
  return NextResponse.json({ success: true })
}
