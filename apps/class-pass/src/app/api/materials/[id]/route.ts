import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { invalidateMaterialCache } from '@/lib/distribution/material-cache'
import { verifyMaterialOwnership } from '@/lib/class-pass-data'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { createServerClient } from '@/lib/supabase/server'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
  subject_id: z.number().int().positive().nullable().optional(),
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

  if (parsed.data.subject_id != null) {
    const materialRow = unwrapSupabaseResult(
      'materials.patch.materialCourse',
      await db
        .from('materials')
        .select('course_id, material_type')
        .eq('id', materialId)
        .maybeSingle(),
    ) as { course_id: number; material_type: string } | null

    if (materialRow && materialRow.material_type !== 'handout') {
      return NextResponse.json(
        { error: '과목 지정(좌석 기반 배부)은 배부자료에만 설정할 수 있습니다.' },
        { status: 400 },
      )
    }

    const subjectRow = materialRow
      ? unwrapSupabaseResult(
        'materials.patch.subjectCheck',
        await db
          .from('course_subjects')
          .select('id')
          .eq('id', parsed.data.subject_id)
          .eq('course_id', materialRow.course_id)
          .maybeSingle(),
      ) as { id: number } | null
      : null

    if (!subjectRow) {
      return NextResponse.json({ error: '선택한 과목이 이 강좌에 속하지 않습니다.' }, { status: 400 })
    }
  }

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

  const refresh = await invalidateMaterialCache()
  return NextResponse.json({ material: data, ...refresh })
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
  const { data, error } = await db.rpc('delete_material_atomic', {
    p_division: division,
    p_material_id: materialId,
  })
  if (error) {
    return NextResponse.json({ error: '자료를 삭제하지 못했습니다.' }, { status: 500 })
  }
  const result = data as { success: boolean; reason?: string } | null
  if (result?.reason === 'MATERIAL_NOT_FOUND') {
    return NextResponse.json({ error: '자료를 찾을 수 없습니다.' }, { status: 404 })
  }
  if (result?.reason === 'HAS_RECEIPTS') {
    return NextResponse.json(
      { error: '이미 배부 이력이 있는 자료는 삭제할 수 없습니다. 비활성 상태로 변경해 주세요.' },
      { status: 400 },
    )
  }

  if (result?.reason === 'HAS_ASSIGNMENTS') {
    return NextResponse.json(
      { error: '이미 학생 배정 이력이 있는 교재는 삭제할 수 없습니다. 배정을 해제하거나 비활성 상태로 변경해 주세요.' },
      { status: 400 },
    )
  }

  if (!result?.success) {
    return NextResponse.json({ error: '자료를 삭제하지 못했습니다.' }, { status: 500 })
  }

  const refresh = await invalidateMaterialCache()
  return NextResponse.json({ success: true, ...refresh })
}
