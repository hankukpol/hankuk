import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { handleRouteError } from '@/lib/api/error-response'
import { invalidateCache } from '@/lib/cache/revalidate'
import { verifyCourseOwnership } from '@/lib/class-pass-data'
import { buildMaterialSeriesNames } from '@/lib/distribution/material-series'
import { createServerClient } from '@/lib/supabase/server'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { getServerTenantType } from '@/lib/tenant.server'
import type { Material } from '@/types/database'

const schema = z.object({
  courseId: z.number().int().positive(),
  sourceMaterialId: z.number().int().positive().optional(),
  namePattern: z.string().trim().min(1).max(110),
  startRound: z.number().int(),
  endRound: z.number().int(),
  description: z.string().max(5000).nullable().optional(),
  subjectId: z.number().int().positive().nullable().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError
    const featureError = await requireAppFeature('admin_material_management_enabled')
    if (featureError) return featureError
    const parsed = schema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: '회차 생성 요청을 확인해 주세요.' }, { status: 400 })
    }
    const input = parsed.data
    let names: string[]
    try {
      names = buildMaterialSeriesNames(input.namePattern, input.startRound, input.endRound)
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 })
    }
    const division = await getServerTenantType()
    if (!(await verifyCourseOwnership(input.courseId, division))) {
      return NextResponse.json({ error: '과정을 찾을 수 없습니다.' }, { status: 404 })
    }
    const db = createServerClient()
    let description = input.description || null
    let subjectId = input.subjectId ?? null
    if (input.sourceMaterialId !== undefined) {
      // Copy only settings from a handout in this authorized course.
      const source = unwrapSupabaseResult('materials.series.source', await db.from('materials')
        .select('id, description, subject_id').eq('id', input.sourceMaterialId)
        .eq('course_id', input.courseId).eq('material_type', 'handout').maybeSingle()) as
        Pick<Material, 'id' | 'description' | 'subject_id'> | null
      if (!source) {
        return NextResponse.json({ error: '복사할 배부자료를 찾을 수 없습니다.' }, { status: 404 })
      }
      description = source.description
      subjectId = source.subject_id ?? null
    }
    if (subjectId !== null) {
      const subject = unwrapSupabaseResult('materials.series.subject', await db.from('course_subjects')
        .select('id').eq('id', subjectId).eq('course_id', input.courseId).maybeSingle())
      if (!subject) {
        return NextResponse.json({ error: '배부 대상 과목이 이 강좌에 속하지 않습니다.' }, { status: 400 })
      }
    }
    const duplicates = unwrapSupabaseResult('materials.series.duplicates', await db.from('materials')
      .select('id').eq('course_id', input.courseId).eq('material_type', 'handout').in('name', names).limit(1))
    if (duplicates?.length) {
      return NextResponse.json({ error: '같은 이름의 배부자료가 이미 있습니다. 목록을 새로고침해 확인한 뒤 회차나 이름을 바꿔 주세요.' }, { status: 409 })
    }
    const last = unwrapSupabaseResult('materials.series.order', await db.from('materials')
      .select('sort_order').eq('course_id', input.courseId).eq('material_type', 'handout')
      .order('sort_order', { ascending: false }).limit(1).maybeSingle()) as { sort_order: number } | null
    const firstOrder = last ? last.sort_order + 1 : 0
    if (firstOrder + names.length - 1 > 999) {
      return NextResponse.json({ error: '정렬 순서가 999를 넘습니다. 기존 자료의 정렬 순서를 조정한 뒤 다시 만들어 주세요.' }, { status: 400 })
    }
    // One insert statement: new IDs, inactive, no assignments or receipt-log writes.
    const materials = unwrapSupabaseResult('materials.series.insert', await db.from('materials')
      .insert(names.map((name, index) => ({
        course_id: input.courseId,
        name,
        description,
        subject_id: subjectId,
        material_type: 'handout',
        is_active: false,
        sort_order: firstOrder + index,
      }))).select('*'))
    let warning: string | undefined
    try {
      await invalidateCache('materials')
    } catch (error) {
      console.error('materials.series.cache', error)
      warning = '자료는 저장됐습니다. 다른 화면에 보이지 않으면 잠시 후 새로고침해 주세요.'
    }
    return NextResponse.json({ materials, warning }, { status: 201 })
  } catch (error) {
    return handleRouteError('materials.series.POST', '회차 생성 결과를 확인하지 못했습니다. 목록을 새로고침해 저장 여부를 확인해 주세요.', error)
  }
}
