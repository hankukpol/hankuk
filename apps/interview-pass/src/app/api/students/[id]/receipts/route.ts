import { NextRequest, NextResponse } from 'next/server'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { withDivisionFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
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
  const { data } = await withDivisionFallback(
    () =>
      db
        .from('distribution_logs')
        .select('material_id, distributed_at')
        .eq('student_id', id)
        .in('division', getScopedDivisionValues(division)),
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
