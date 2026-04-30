import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const reorderSchema = z.object({
  courseIds: z.array(z.number().int().positive()).min(1).max(999),
})

export async function PATCH(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_course_management_enabled')
  if (featureError) {
    return featureError
  }

  const body = await req.json().catch(() => null)
  const parsed = reorderSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '강좌 순서 변경 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const courseIds = parsed.data.courseIds
  if (new Set(courseIds).size !== courseIds.length) {
    return NextResponse.json({ error: '중복된 강좌가 포함되어 있습니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const db = createServerClient()
  const { data: existingCourses, error: loadError } = await db
    .from('courses')
    .select('id')
    .eq('division', division)

  if (loadError) {
    return NextResponse.json({ error: '현재 강좌 목록을 확인하지 못했습니다.' }, { status: 500 })
  }

  const existingIds = new Set((existingCourses ?? []).map((course) => course.id))
  const requestMatchesCurrentCourses =
    existingIds.size === courseIds.length && courseIds.every((courseId) => existingIds.has(courseId))

  if (!requestMatchesCurrentCourses) {
    return NextResponse.json(
      { error: '현재 강좌 목록과 요청 목록이 일치하지 않습니다. 새로고침 후 다시 시도해주세요.' },
      { status: 409 },
    )
  }

  const nowIso = new Date().toISOString()
  const updateResults = await Promise.all(courseIds.map((courseId, index) => (
    db
      .from('courses')
      .update({
        sort_order: index,
        updated_at: nowIso,
      })
      .eq('id', courseId)
      .eq('division', division)
      .select('id')
      .maybeSingle()
  )))
  const failedUpdate = updateResults.find((result) => result.error || !result.data)

  if (failedUpdate) {
    return NextResponse.json({ error: '강좌 순서를 저장하지 못했습니다.' }, { status: 500 })
  }

  await invalidateCache('courses')
  return NextResponse.json({ success: true })
}
