import { NextRequest, NextResponse } from 'next/server'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { withDivisionFallback, withStudentStatusFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { ACTIVE_STUDENT_STATUS } from '@/lib/student-status'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

function formatKstTimestamp(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const featureError = await requireAppFeature('student_receipt_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const division = await getServerTenantType()
  const db = createServerClient()
  const scope = getScopedDivisionValues(division)

  const { data: student } = await withStudentStatusFallback(
    () =>
      withDivisionFallback(
        () =>
          db
            .from('students')
            .select('id')
            .eq('id', id)
            .in('division', scope)
            .eq('status', ACTIVE_STUDENT_STATUS)
            .maybeSingle(),
        () =>
          db
            .from('students')
            .select('id')
            .eq('id', id)
            .eq('status', ACTIVE_STUDENT_STATUS)
            .maybeSingle(),
      ),
    () =>
      withDivisionFallback(
        () =>
          db
            .from('students')
            .select('id')
            .eq('id', id)
            .in('division', scope)
            .maybeSingle(),
        () =>
          db
            .from('students')
            .select('id')
            .eq('id', id)
            .maybeSingle(),
      ),
  )

  if (!student) {
    return NextResponse.json({ error: '?숈깮 ?뺣낫瑜?李얠쓣 ???놁뒿?덈떎.' }, { status: 404 })
  }

  const { data } = await withDivisionFallback(
    () =>
      db
        .from('distribution_logs')
        .select('material_id, distributed_at')
        .eq('student_id', id)
        .in('division', scope),
    () =>
      db
        .from('distribution_logs')
        .select('material_id, distributed_at')
        .eq('student_id', id),
  )

  const receipts: Record<number, string> = {}
  for (const row of data ?? []) {
    receipts[row.material_id] = formatKstTimestamp(row.distributed_at)
  }

  return NextResponse.json({ receipts })
}
