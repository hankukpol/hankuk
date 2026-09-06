import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateDistributionCache } from '@/lib/distribution/cache'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  logId: z.number().int().positive(),
})

export async function POST(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_log_view_enabled')
  if (featureError) {
    return featureError
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '배부 기록을 찾을 수 없는 요청입니다. 화면을 새로고침한 뒤 다시 시도해 주세요.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const db = createServerClient()

  const { data: log, error: logError } = await db
    .from('distribution_logs')
    .select('id,enrollment_id,material_id')
    .eq('id', parsed.data.logId)
    .maybeSingle()

  if (logError) {
    return NextResponse.json({ error: '배부 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' }, { status: 500 })
  }

  if (!log) {
    return NextResponse.json({ error: '이미 취소되었거나 없는 배부 기록입니다. 수령 현황을 새로고침해 주세요.' }, { status: 404 })
  }

  const { data: enrollment, error: enrollmentError } = await db
    .from('enrollments')
    .select('id,name,course_id')
    .eq('id', log.enrollment_id)
    .maybeSingle()

  if (enrollmentError || !enrollment) {
    return NextResponse.json({ error: '배부 기록에 연결된 수강생을 찾을 수 없습니다. 명단에서 삭제되었는지 확인해 주세요.' }, { status: 404 })
  }

  const { data: course, error: courseError } = await db
    .from('courses')
    .select('id,division,name')
    .eq('id', enrollment.course_id)
    .eq('division', division)
    .maybeSingle()

  if (courseError || !course) {
    return NextResponse.json({ error: '다른 지점의 배부 기록이라 취소할 수 없습니다.' }, { status: 404 })
  }

  const { data: material } = await db
    .from('materials')
    .select('id,name')
    .eq('id', log.material_id)
    .maybeSingle()

  const { error: deleteError } = await db
    .from('distribution_logs')
    .delete()
    .eq('id', log.id)

  if (deleteError) {
    return NextResponse.json({ error: '배부 취소를 저장하지 못했습니다. 수령 현황을 확인한 뒤 다시 시도해 주세요.' }, { status: 500 })
  }

  const notice = await invalidateDistributionCache()

  return NextResponse.json({
    ...notice,
    success: true,
    logId: log.id,
    enrollmentName: enrollment.name,
    materialName: material?.name ?? null,
    courseName: course.name,
  })
}
