import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { withDivisionFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  student_id: z.string().uuid(),
  material_id: z.number().int().positive(),
})

export async function DELETE(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_student_management_enabled')
  if (featureError) {
    return featureError
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const { student_id: studentId, material_id: materialId } = parsed.data
  const division = await getServerTenantType()
  const db = createServerClient()

  const { data: log } = await withDivisionFallback(
    () =>
      db
        .from('distribution_logs')
        .select('id')
        .in('division', getScopedDivisionValues(division))
        .eq('student_id', studentId)
        .eq('material_id', materialId)
        .order('distributed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    () =>
      db
        .from('distribution_logs')
        .select('id')
        .eq('student_id', studentId)
        .eq('material_id', materialId)
        .order('distributed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
  )

  if (!log) {
    return NextResponse.json({ error: '배부 기록이 없습니다.' }, { status: 404 })
  }

  const { error } = await withDivisionFallback(
    () =>
      db
        .from('distribution_logs')
        .delete()
        .eq('id', log.id)
        .in('division', getScopedDivisionValues(division)),
    () =>
      db
        .from('distribution_logs')
        .delete()
        .eq('id', log.id),
  )
  if (error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
