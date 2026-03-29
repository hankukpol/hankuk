import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { withDivisionFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { getServerTenantType } from '@/lib/tenant.server'

export async function GET(req: NextRequest) {
  const featureError = await requireAppFeature('admin_student_management_enabled')
  if (featureError) {
    return featureError
  }

  const materialId = req.nextUrl.searchParams.get('material_id')
  if (!materialId) {
    return NextResponse.json({ error: 'material_id가 필요합니다.' }, { status: 400 })
  }

  const db = createServerClient()
  const division = await getServerTenantType()
  const scope = getScopedDivisionValues(division)

  const [{ data: received }, { data: students, error }] = await Promise.all([
    withDivisionFallback(
      () =>
        db
          .from('distribution_logs')
          .select('student_id')
          .in('division', scope)
          .eq('material_id', Number(materialId)),
      () =>
        db
          .from('distribution_logs')
          .select('student_id')
          .eq('material_id', Number(materialId)),
    ),
    withDivisionFallback(
      () =>
        db
          .from('students')
          .select('id,name,phone,exam_number,series,region', { count: 'exact' })
          .in('division', scope)
          .order('name'),
      () =>
        db
          .from('students')
          .select('id,name,phone,exam_number,series,region', { count: 'exact' })
          .order('name'),
    ),
  ])

  if (error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  const receivedIds = new Set((received ?? []).map((row) => row.student_id))
  const unreceived = (students ?? []).filter((student) => !receivedIds.has(student.id))

  return NextResponse.json({ students: unreceived, total: unreceived.length })
}
