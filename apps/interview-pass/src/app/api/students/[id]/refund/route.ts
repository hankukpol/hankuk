import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { invalidateCache } from '@/lib/cache/revalidate'
import {
  isMissingStudentStatusColumnError,
  withDivisionFallback,
  withStudentStatusFallback,
} from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { saveLegacyRefundArchive } from '@/lib/students/refund-archive'
import { removeStudentForDivision, type SupabaseErrorLike } from '@/lib/students/remove'
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

type StudentLookupResult = {
  data: ExistingStudent | null
  error: SupabaseErrorLike
}

type LegacyStudentLookupResult = {
  data: { id: string } | null
  error: SupabaseErrorLike
}

function logRefundRouteError(
  stage: 'lookup' | 'update' | 'legacy-archive' | 'legacy-delete',
  studentId: string,
  error: SupabaseErrorLike,
) {
  if (!error) {
    return
  }

  console.error(`[students:refund:${stage}] failed`, {
    studentId,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  })
}

async function archiveThenDeleteLegacyStudent(
  studentId: string,
  division: Awaited<ReturnType<typeof getServerTenantType>>,
  note: string | null,
) {
  const archiveResult = await saveLegacyRefundArchive(studentId, division, note)
  if (archiveResult.error) {
    return { error: archiveResult.error as SupabaseErrorLike }
  }

  const deleteResult = await removeStudentForDivision(studentId, division)
  if (deleteResult.error) {
    return { error: deleteResult.error as SupabaseErrorLike }
  }

  return {
    error: null as SupabaseErrorLike,
    removedDistributionLogs: deleteResult.removedDistributionLogs,
  }
}

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
  const note = parsed.data.note || null
  let usedLegacySchema = false

  const existing = await withStudentStatusFallback(
    () =>
      withDivisionFallback(
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
      ),
    async () => {
      usedLegacySchema = true

      const result = await withDivisionFallback<LegacyStudentLookupResult>(
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
      )

      return {
        ...result,
        data: result.data ? ({ ...result.data, status: ACTIVE_STUDENT_STATUS } as ExistingStudent) : null,
      }
    },
  ) as StudentLookupResult

  if (existing.error) {
    logRefundRouteError('lookup', id, existing.error)
    return NextResponse.json({ error: '학생 정보를 확인하지 못했습니다.' }, { status: 500 })
  }

  if (!existing.data) {
    return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })
  }

  if (existing.data.status === REFUNDED_STUDENT_STATUS) {
    return NextResponse.json({ success: true, alreadyRefunded: true })
  }

  if (usedLegacySchema) {
    const legacyResult = await archiveThenDeleteLegacyStudent(id, division, note)

    if (legacyResult.error) {
      logRefundRouteError('legacy-delete', id, legacyResult.error)
      return NextResponse.json({ error: '학생을 환불 처리하지 못했습니다.' }, { status: 500 })
    }

    await invalidateCache('students')
    return NextResponse.json({
      success: true,
      legacyDeleted: true,
      removedDistributionLogs: legacyResult.removedDistributionLogs,
    })
  }

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
      const legacyResult = await archiveThenDeleteLegacyStudent(id, division, note)

      if (legacyResult.error) {
        logRefundRouteError('legacy-delete', id, legacyResult.error)
        return NextResponse.json({ error: '학생을 환불 처리하지 못했습니다.' }, { status: 500 })
      }

      await invalidateCache('students')
      return NextResponse.json({
        success: true,
        legacyDeleted: true,
        removedDistributionLogs: legacyResult.removedDistributionLogs,
      })
    }

    logRefundRouteError('update', id, error)
    return NextResponse.json({ error: '학생을 환불 처리하지 못했습니다.' }, { status: 500 })
  }

  await invalidateCache('students')
  return NextResponse.json({ success: true })
}
