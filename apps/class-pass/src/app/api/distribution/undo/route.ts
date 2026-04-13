import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
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
    return NextResponse.json({ error: 'Invalid distribution log id.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const db = createServerClient()

  const { data: log, error: logError } = await db
    .from('distribution_logs')
    .select('id,enrollment_id,material_id')
    .eq('id', parsed.data.logId)
    .maybeSingle()

  if (logError) {
    return NextResponse.json({ error: 'Failed to load the distribution log.' }, { status: 500 })
  }

  if (!log) {
    return NextResponse.json({ error: 'The distribution log was not found.' }, { status: 404 })
  }

  const { data: enrollment, error: enrollmentError } = await db
    .from('enrollments')
    .select('id,name,course_id')
    .eq('id', log.enrollment_id)
    .maybeSingle()

  if (enrollmentError || !enrollment) {
    return NextResponse.json({ error: 'The linked enrollment was not found.' }, { status: 404 })
  }

  const { data: course, error: courseError } = await db
    .from('courses')
    .select('id,division,name')
    .eq('id', enrollment.course_id)
    .eq('division', division)
    .maybeSingle()

  if (courseError || !course) {
    return NextResponse.json({ error: 'The log does not belong to this division.' }, { status: 404 })
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
    return NextResponse.json({ error: 'Failed to undo the distribution log.' }, { status: 500 })
  }

  await invalidateCache('distribution-logs')

  return NextResponse.json({
    success: true,
    logId: log.id,
    enrollmentName: enrollment.name,
    materialName: material?.name ?? null,
    courseName: course.name,
  })
}
