import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { withDivisionFallback, withStudentStatusFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { ACTIVE_STUDENT_STATUS } from '@/lib/student-status'
import { getServerTenantType } from '@/lib/tenant.server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const featureError = await requireAppFeature('monitor_enabled')
  if (featureError) {
    return featureError
  }

  const db = createServerClient()
  const division = await getServerTenantType()
  const scope = getScopedDivisionValues(division)

  const [
    { data: students, error: studentsError },
    { data: materials, error: materialsError },
    { data: logs, error: logsError },
  ] = await Promise.all([
    withStudentStatusFallback(
      () =>
        withDivisionFallback(
          () =>
            db
              .from('students')
              .select('id')
              .in('division', scope)
              .eq('status', ACTIVE_STUDENT_STATUS),
          () =>
            db
              .from('students')
              .select('id')
              .eq('status', ACTIVE_STUDENT_STATUS),
        ),
      () =>
        withDivisionFallback(
          () =>
            db
              .from('students')
              .select('id')
              .in('division', scope),
          () =>
            db
              .from('students')
              .select('id'),
        ),
    ),
    withDivisionFallback(
      () =>
        db
          .from('materials')
          .select('id,name,is_active')
          .in('division', scope)
          .eq('is_active', true)
          .order('sort_order'),
      () =>
        db
          .from('materials')
          .select('id,name,is_active')
          .eq('is_active', true)
          .order('sort_order'),
    ),
    withDivisionFallback(
      () =>
        db
          .from('distribution_logs')
          .select('material_id, student_id')
          .in('division', scope),
      () =>
        db
          .from('distribution_logs')
          .select('material_id, student_id'),
    ),
  ])

  if (studentsError || materialsError || logsError) {
    return NextResponse.json({ error: '?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.' }, { status: 500 })
  }

  const activeStudentIds = new Set((students ?? []).map((student) => student.id))
  const materialStudentMap: Record<number, Set<string>> = {}

  for (const log of logs ?? []) {
    if (!activeStudentIds.has(log.student_id)) {
      continue
    }

    if (!materialStudentMap[log.material_id]) {
      materialStudentMap[log.material_id] = new Set()
    }

    materialStudentMap[log.material_id].add(log.student_id)
  }

  return NextResponse.json(
    {
      totalStudents: activeStudentIds.size,
      byMaterial: (materials ?? []).map((material) => ({
        id: material.id,
        name: material.name,
        count: materialStudentMap[material.id]?.size ?? 0,
      })),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}
