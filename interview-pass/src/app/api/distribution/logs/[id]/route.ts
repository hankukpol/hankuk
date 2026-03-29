import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { withDivisionFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { getServerTenantType } from '@/lib/tenant.server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const featureError = await requireAppFeature('admin_distribution_logs_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const division = await getServerTenantType()
  const db = createServerClient()
  const { error } = await withDivisionFallback(
    () =>
      db
        .from('distribution_logs')
        .delete()
        .eq('id', Number(id))
        .in('division', getScopedDivisionValues(division)),
    () =>
      db
        .from('distribution_logs')
        .delete()
        .eq('id', Number(id)),
  )

  if (error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
