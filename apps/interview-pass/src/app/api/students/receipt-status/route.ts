import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { withDivisionFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { getServerTenantType } from '@/lib/tenant.server'

export async function GET(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_student_management_enabled')
  if (featureError) {
    return featureError
  }

  const sp = req.nextUrl.searchParams
  const page = Math.max(1, Number(sp.get('page') ?? 1))
  const limit = Math.min(100, Math.max(1, Number(sp.get('limit') ?? 50)))
  const search = sp.get('search') ?? ''
  const offset = (page - 1) * limit

  const db = createServerClient()
  const division = await getServerTenantType()
  const scope = getScopedDivisionValues(division)

  const { data: materials, error: materialsError } = await withDivisionFallback(
    () =>
      db
        .from('materials')
        .select('id, name')
        .in('division', scope)
        .eq('is_active', true)
        .order('sort_order'),
    () =>
      db
        .from('materials')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order'),
  )

  const buildStudentsQuery = (scoped: boolean) => {
    let query = db
      .from('students')
      .select('id, name, exam_number, series, region', { count: 'exact' })
      .order('name')

    if (scoped) {
      query = query.in('division', scope)
    }

    if (search) {
      const escaped = search.replace(/[%_\\]/g, '\\$&')
      query = query.or(
        `name.ilike.%${escaped}%,phone.ilike.%${escaped}%,exam_number.ilike.%${escaped}%`,
      )
    }

    return query.range(offset, offset + limit - 1)
  }

  const { data: students, count, error: studentsError } = await withDivisionFallback(
    () => buildStudentsQuery(true),
    () => buildStudentsQuery(false),
  )
  if (materialsError || studentsError) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  if (!students?.length) {
    return NextResponse.json({ students: [], materials: materials ?? [], total: count ?? 0 })
  }

  const studentIds = students.map((student) => student.id)
  const { data: logs, error: logsError } = await withDivisionFallback(
    () =>
      db
        .from('distribution_logs')
        .select('student_id, material_id')
        .in('division', scope)
        .in('student_id', studentIds),
    () =>
      db
        .from('distribution_logs')
        .select('student_id, material_id')
        .in('student_id', studentIds),
  )

  if (logsError) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  const receiptMap: Record<string, Set<number>> = {}
  for (const log of logs ?? []) {
    if (!receiptMap[log.student_id]) receiptMap[log.student_id] = new Set()
    receiptMap[log.student_id].add(log.material_id)
  }

  const result = students.map((student) => ({
    ...student,
    received_ids: [...(receiptMap[student.id] ?? [])],
  }))

  return NextResponse.json({ students: result, materials: materials ?? [], total: count ?? 0 })
}
