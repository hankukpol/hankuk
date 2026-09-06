import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { randomUUID } from 'node:crypto'
import { invalidateMaterialCache } from '@/lib/distribution/material-cache'
import { getCourseById, listMaterialsForCourse, verifyCourseOwnership } from '@/lib/class-pass-data'
import { createServerClient } from '@/lib/supabase/server'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  requestId: z.string().uuid().optional(),
  courseId: z.number().int().positive(),
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(999).default(0),
  material_type: z.enum(['handout', 'textbook']).default('handout'),
  subject_id: z.number().int().positive().nullable().optional(),
})

export async function GET(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const courseId = Number(req.nextUrl.searchParams.get('courseId'))
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: 'courseId가 필요합니다.' }, { status: 400 })
  }

  const materialType = req.nextUrl.searchParams.get('materialType')
  if (materialType && materialType !== 'handout' && materialType !== 'textbook') {
    return NextResponse.json({ error: 'materialType 값이 올바르지 않습니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  if (!(await verifyCourseOwnership(courseId, division))) {
    return NextResponse.json({ error: '과정을 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({
    materials: await listMaterialsForCourse(courseId, {
      materialType: materialType === 'handout' || materialType === 'textbook'
        ? materialType
        : undefined,
    }),
  })
}

export async function POST(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_material_management_enabled')
  if (featureError) {
    return featureError
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '자료 생성 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const course = await getCourseById(parsed.data.courseId, division)
  if (!course) {
    return NextResponse.json({ error: '과정을 찾을 수 없습니다.' }, { status: 404 })
  }

  const db = createServerClient()

  if (parsed.data.subject_id != null) {
    if (parsed.data.material_type !== 'handout') {
      return NextResponse.json(
        { error: '과목 지정(좌석 기반 배부)은 배부자료에만 설정할 수 있습니다.' },
        { status: 400 },
      )
    }

    const subjectRow = unwrapSupabaseResult(
      'materials.create.subjectCheck',
      await db
        .from('course_subjects')
        .select('id')
        .eq('id', parsed.data.subject_id)
        .eq('course_id', parsed.data.courseId)
        .maybeSingle(),
    ) as { id: number } | null

    if (!subjectRow) {
      return NextResponse.json({ error: '선택한 과목이 이 강좌에 속하지 않습니다.' }, { status: 400 })
    }
  }

  const { data, error } = await db.rpc('create_material_atomic', {
    p_division: division,
    // Legacy callers remain compatible; updated clients persist one UUID across retries.
    p_request_id: parsed.data.requestId ?? randomUUID(),
    p_course_id: parsed.data.courseId,
    p_payload: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      is_active: parsed.data.is_active,
      sort_order: parsed.data.sort_order,
      material_type: parsed.data.material_type,
      subject_id: parsed.data.subject_id ?? null,
    },
  })

  if (error) {
    return NextResponse.json({ error: '자료를 생성하지 못했습니다.' }, { status: 500 })
  }

  if (!data?.success) {
    const reason = data?.reason
    const status = reason === 'IDEMPOTENCY_CONFLICT' || reason === 'MATERIAL_DELETED' ? 409
      : reason === 'COURSE_NOT_FOUND' ? 404 : 400
    return NextResponse.json({
      error: reason === 'MATERIAL_DELETED' ? '이미 생성된 자료가 삭제되었습니다. 목록을 확인해 주세요.'
        : reason === 'IDEMPOTENCY_CONFLICT' ? '같은 생성 요청의 내용이 변경되었습니다. 기존 요청 결과를 확인해 주세요.'
          : '자료 생성 요청을 확인해 주세요.',
    }, { status })
  }
  const cacheResult = await invalidateMaterialCache()
  return NextResponse.json({ material: data.material, ...cacheResult }, { status: 201 })
}
