import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { withDivisionFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { getServerTenantType } from '@/lib/tenant.server'

function logDistributionLogsError(context: string, error: {
  code?: string
  message?: string
  details?: string
  hint?: string
}) {
  console.error(`[distribution-logs:${context}]`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  })
}

export async function GET(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_distribution_logs_enabled')
  if (featureError) {
    return featureError
  }

  const sp = req.nextUrl.searchParams
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '50', 10) || 50))
  const offset = (page - 1) * limit
  const search = sp.get('q')?.trim() ?? ''

  const db = createServerClient()
  const division = await getServerTenantType()
  const scope = getScopedDivisionValues(division)

  let studentIds: string[] | null = null
  if (search) {
    const escaped = search.replace(/[%_\\]/g, '\\$&')
    const { data: matched, error: matchedError } = await withDivisionFallback(
      () =>
        db
          .from('students')
          .select('id')
          .in('division', scope)
          .or(`name.ilike.%${escaped}%,exam_number.ilike.%${escaped}%,phone.ilike.%${escaped}%`),
      () =>
        db
          .from('students')
          .select('id')
          .or(`name.ilike.%${escaped}%,exam_number.ilike.%${escaped}%,phone.ilike.%${escaped}%`),
    )

    if (matchedError) {
      logDistributionLogsError('GET:search', matchedError)
      return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }

    studentIds = (matched ?? []).map((student) => student.id)
    if (studentIds.length === 0) {
      return NextResponse.json({ logs: [], total: 0 })
    }
  }

  const buildQuery = (scoped: boolean) => {
    let query = db
      .from('distribution_logs')
      .select(
        'id, distributed_at, distributed_by, note, students(name, exam_number, series, region), materials(name)',
        { count: 'exact' },
      )
      .order('distributed_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (scoped) {
      query = query.in('division', scope)
    }

    if (studentIds) {
      query = query.in('student_id', studentIds)
    }

    return query
  }

  const { data, count, error } = await withDivisionFallback(
    () => buildQuery(true),
    () => buildQuery(false),
  )
  if (error) {
    logDistributionLogsError('GET:list', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ logs: data ?? [], total: count ?? 0 })
}
