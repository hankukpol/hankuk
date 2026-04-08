import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { invalidateCache } from '@/lib/cache/revalidate'
import {
  isMissingStudentStatusColumnError,
  withDivisionFallback,
} from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { ACTIVE_STUDENT_STATUS, REFUNDED_STUDENT_STATUS } from '@/lib/student-status'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const refundSchema = z.object({
  note: z.string().trim().max(500).optional(),
})

type ExistingStudent = {
  id: string
  status: 'active' | 'refunded'
}

const MIGRATION_REQUIRED_MESSAGE = '환불 기능을 사용하려면 학생 상태 컬럼 마이그레이션을 먼저 적용해 주세요.'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_student_management_enabled')
  if (featureError) {
    return featureError
  }

  const body = await req.json().catch(() => ({}))
  const parsed = refundSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  const { id } = await params
  const division = await getServerTenantType()
  const scope = getScopedDivisionValues(division)
  const db = createServerClient()

  const existing = await withDivisionFallback(
    () =>
      db
        .from('students')
        .select('id,status')
        .eq('id', id)
        .in('division', scope)
        .maybeSingle(),
    () =>
      db
        .from('students')
        .select('id,status')
        .eq('id', id)
        .maybeSingle(),
  ) as { data: ExistingStudent | null; error: { code?: string; message?: string; details?: string; hint?: string } | null }

  if (existing.error) {
    if (isMissingStudentStatusColumnError(existing.error)) {
      return NextResponse.json({ error: MIGRATION_REQUIRED_MESSAGE }, { status: 503 })
    }

    return NextResponse.json({ error: '학생 정보를 확인하지 못했습니다.' }, { status: 500 })
  }

  if (!existing.data) {
    return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })
  }

  if (existing.data.status === REFUNDED_STUDENT_STATUS) {
    return NextResponse.json({ success: true, alreadyRefunded: true })
  }

  const note = parsed.data.note || null
  const { error } = await withDivisionFallback(
    () =>
      db
        .from('students')
        .update({
          status: REFUNDED_STUDENT_STATUS,
          refunded_at: new Date().toISOString(),
          refund_note: note,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', ACTIVE_STUDENT_STATUS)
        .in('division', scope),
    () =>
      db
        .from('students')
        .update({
          status: REFUNDED_STUDENT_STATUS,
          refunded_at: new Date().toISOString(),
          refund_note: note,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', ACTIVE_STUDENT_STATUS),
  )

  if (error) {
    if (isMissingStudentStatusColumnError(error)) {
      return NextResponse.json({ error: MIGRATION_REQUIRED_MESSAGE }, { status: 503 })
    }

    return NextResponse.json({ error: '학생을 환불 처리하지 못했습니다.' }, { status: 500 })
  }

  await invalidateCache('students')
  return NextResponse.json({ success: true })
}
