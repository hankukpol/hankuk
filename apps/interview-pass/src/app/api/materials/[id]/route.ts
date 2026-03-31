import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { invalidateCache } from '@/lib/cache/revalidate'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { withDivisionFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { getServerTenantType } from '@/lib/tenant.server'

type MaterialRow = {
  id: number
  name: string
  description: string | null
  is_active: boolean
  sort_order: number
}

function parseMaterialId(rawId: string) {
  const materialId = Number(rawId)
  if (!Number.isInteger(materialId) || materialId <= 0) {
    return null
  }

  return materialId
}

function logMaterialRouteError(context: string, error: {
  code?: string
  message?: string
  details?: string
  hint?: string
}) {
  console.error(`[materials:${context}]`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  })
}

async function findMaterialById(materialId: number, division: 'police' | 'fire') {
  const db = createServerClient()
  const scope = getScopedDivisionValues(division)

  return withDivisionFallback(
    () =>
      db
        .from('materials')
        .select('id, name, description, is_active, sort_order')
        .eq('id', materialId)
        .in('division', scope)
        .maybeSingle(),
    () =>
      db
        .from('materials')
        .select('id, name, description, is_active, sort_order')
        .eq('id', materialId)
        .maybeSingle(),
  ) as Promise<{ data: MaterialRow | null; error: { code?: string; message?: string; details?: string; hint?: string } | null }>
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_materials_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const materialId = parseMaterialId(id)
  if (!materialId) {
    return NextResponse.json({ error: '잘못된 자료 ID입니다.' }, { status: 400 })
  }

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

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: '수정할 내용을 입력해 주세요.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const existing = await findMaterialById(materialId, division)
  if (existing.error) {
    logMaterialRouteError('PATCH:find', existing.error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  if (!existing.data) {
    return NextResponse.json({ error: '자료를 찾을 수 없습니다.' }, { status: 404 })
  }

  const db = createServerClient()
  const { data, error } = await withDivisionFallback(
    () =>
      db
        .from('materials')
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq('id', materialId)
        .in('division', getScopedDivisionValues(division))
        .select('id, name, description, is_active, sort_order')
        .maybeSingle(),
    () =>
      db
        .from('materials')
        .update({ ...parsed.data, updated_at: new Date().toISOString() })
        .eq('id', materialId)
        .select('id, name, description, is_active, sort_order')
        .maybeSingle(),
  )

  if (error) {
    logMaterialRouteError('PATCH:update', error)
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 같은 자료가 존재합니다.' }, { status: 409 })
    }

    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: '자료를 찾을 수 없습니다.' }, { status: 404 })
  }

  await invalidateCache('materials')
  return NextResponse.json({ material: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_materials_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const materialId = parseMaterialId(id)
  if (!materialId) {
    return NextResponse.json({ error: '잘못된 자료 ID입니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const existing = await findMaterialById(materialId, division)
  if (existing.error) {
    logMaterialRouteError('DELETE:find', existing.error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  if (!existing.data) {
    return NextResponse.json({ error: '자료를 찾을 수 없습니다.' }, { status: 404 })
  }

  const db = createServerClient()
  const { error } = await withDivisionFallback(
    () =>
      db
        .from('materials')
        .delete()
        .eq('id', materialId)
        .in('division', getScopedDivisionValues(division)),
    () => db.from('materials').delete().eq('id', materialId),
  )

  if (error) {
    logMaterialRouteError('DELETE:delete', error)
    if (error.code === '23503') {
      return NextResponse.json(
        { error: '배부 이력이 있는 자료는 삭제할 수 없습니다. 비활성화로 처리해 주세요.' },
        { status: 409 },
      )
    }

    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  await invalidateCache('materials')
  return NextResponse.json({ success: true })
}
