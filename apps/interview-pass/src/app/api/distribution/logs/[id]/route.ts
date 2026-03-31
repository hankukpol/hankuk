import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { withDivisionFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { getServerTenantType } from '@/lib/tenant.server'

function parseLogId(rawId: string) {
  const logId = Number(rawId)
  if (!Number.isInteger(logId) || logId <= 0) {
    return null
  }

  return logId
}

function logDistributionLogDeleteError(context: string, error: {
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

async function findLogById(logId: number, division: 'police' | 'fire') {
  const db = createServerClient()
  const scope = getScopedDivisionValues(division)

  return withDivisionFallback(
    () =>
      db
        .from('distribution_logs')
        .select('id')
        .eq('id', logId)
        .in('division', scope)
        .maybeSingle(),
    () =>
      db
        .from('distribution_logs')
        .select('id')
        .eq('id', logId)
        .maybeSingle(),
  ) as Promise<{ data: { id: number } | null; error: { code?: string; message?: string; details?: string; hint?: string } | null }>
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_distribution_logs_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const logId = parseLogId(id)
  if (!logId) {
    return NextResponse.json({ error: '잘못된 로그 ID입니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const existing = await findLogById(logId, division)
  if (existing.error) {
    logDistributionLogDeleteError('DELETE:find', existing.error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  if (!existing.data) {
    return NextResponse.json({ error: '배부 로그를 찾을 수 없습니다.' }, { status: 404 })
  }

  const db = createServerClient()
  const { error } = await withDivisionFallback(
    () =>
      db
        .from('distribution_logs')
        .delete()
        .eq('id', logId)
        .in('division', getScopedDivisionValues(division)),
    () =>
      db
        .from('distribution_logs')
        .delete()
        .eq('id', logId),
  )

  if (error) {
    logDistributionLogDeleteError('DELETE:delete', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
