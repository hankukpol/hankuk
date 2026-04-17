import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { invalidateCache } from '@/lib/cache/revalidate'
import { verifyMaterialOwnership } from '@/lib/class-pass-data'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_material_management_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const materialId = parsePositiveInt(id)
  if (!materialId) {
    return NextResponse.json({ error: '잘못된 자료 ID입니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  if (!(await verifyMaterialOwnership(materialId, division))) {
    return NextResponse.json({ error: '자료를 찾을 수 없습니다.' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '자료 수정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('materials')
    .update(parsed.data)
    .eq('id', materialId)
    .select('*')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: '자료를 수정하지 못했습니다.' }, { status: 500 })
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

  const featureError = await requireAppFeature('admin_material_management_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const materialId = parsePositiveInt(id)
  if (!materialId) {
    return NextResponse.json({ error: '잘못된 자료 ID입니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  if (!(await verifyMaterialOwnership(materialId, division))) {
    return NextResponse.json({ error: '자료를 찾을 수 없습니다.' }, { status: 404 })
  }

  const db = createServerClient()
  const [distributionLogResult, textbookAssignmentResult] = await Promise.all([
    db
      .from('distribution_logs')
      .select('id')
      .eq('material_id', materialId)
      .limit(1)
      .maybeSingle(),
    db
      .from('textbook_assignments')
      .select('id')
      .eq('material_id', materialId)
      .limit(1)
      .maybeSingle(),
  ])

  if (distributionLogResult.error || textbookAssignmentResult.error) {
    return NextResponse.json({ error: '자료 삭제 전 이력을 확인하지 못했습니다.' }, { status: 500 })
  }

  if (distributionLogResult.data) {
    return NextResponse.json(
      { error: '이미 배부 이력이 있는 자료는 삭제할 수 없습니다. 비활성 상태로 변경해 주세요.' },
      { status: 400 },
    )
  }

  if (textbookAssignmentResult.data) {
    return NextResponse.json(
      { error: '이미 학생 배정 이력이 있는 교재는 삭제할 수 없습니다. 배정을 해제하거나 비활성 상태로 변경해 주세요.' },
      { status: 400 },
    )
  }

  const { error } = await db
    .from('materials')
    .delete()
    .eq('id', materialId)

  if (error) {
    return NextResponse.json({ error: '자료를 삭제하지 못했습니다.' }, { status: 500 })
  }

  await invalidateCache('materials')
  return NextResponse.json({ success: true })
}
