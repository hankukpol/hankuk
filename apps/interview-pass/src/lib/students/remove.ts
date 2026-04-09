import type { TenantType } from '@/lib/tenant'
import { withDivisionFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { createServerClient } from '@/lib/supabase/server'

export type SupabaseErrorLike = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
} | null

export async function removeStudentForDivision(studentId: string, division: TenantType) {
  const db = createServerClient()
  const scope = getScopedDivisionValues(division)

  const deleteStudent = () =>
    withDivisionFallback(
      () =>
        db
          .from('students')
          .delete()
          .eq('id', studentId)
          .in('division', scope),
      () =>
        db
          .from('students')
          .delete()
          .eq('id', studentId),
    )

  let { error } = await deleteStudent()
  let removedDistributionLogs = false

  // Legacy refund fallback needs to remove dependent logs before deleting.
  if (error?.code === '23503') {
    const { error: logDeleteError } = await withDivisionFallback(
      () =>
        db
          .from('distribution_logs')
          .delete()
          .eq('student_id', studentId)
          .in('division', scope),
      () =>
        db
          .from('distribution_logs')
          .delete()
          .eq('student_id', studentId),
    )

    if (logDeleteError) {
      return { error: logDeleteError as SupabaseErrorLike, removedDistributionLogs }
    }

    removedDistributionLogs = true
    const retry = await deleteStudent()
    error = retry.error
  }

  return { error: (error ?? null) as SupabaseErrorLike, removedDistributionLogs }
}
