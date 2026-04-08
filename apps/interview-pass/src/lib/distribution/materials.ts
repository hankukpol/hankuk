import { withDivisionFallback, withStudentStatusFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { ACTIVE_STUDENT_STATUS } from '@/lib/student-status'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

export type DistributionFailureReason =
  | 'student_not_found'
  | 'material_inactive'
  | 'already_distributed'

export interface DistributionResult {
  success: boolean
  reason?: DistributionFailureReason
  log_id?: number
  material_name?: string
  student_name?: string
}

interface DistributeMaterialInput {
  studentId: string
  materialId: number
  distributedBy: string
  note?: string
}

export async function distributeMaterial({
  studentId,
  materialId,
  distributedBy,
  note = '',
}: DistributeMaterialInput): Promise<DistributionResult> {
  const db = createServerClient()
  const division = await getServerTenantType()
  const scope = getScopedDivisionValues(division)

  const [{ data: student }, { data: material }] = await Promise.all([
    withStudentStatusFallback(
      () =>
        withDivisionFallback(
          () =>
            db
              .from('students')
              .select('id, name')
              .eq('id', studentId)
              .in('division', scope)
              .eq('status', ACTIVE_STUDENT_STATUS)
              .maybeSingle(),
          () =>
            db
              .from('students')
              .select('id, name')
              .eq('id', studentId)
              .eq('status', ACTIVE_STUDENT_STATUS)
              .maybeSingle(),
        ),
      () =>
        withDivisionFallback(
          () =>
            db
              .from('students')
              .select('id, name')
              .eq('id', studentId)
              .in('division', scope)
              .maybeSingle(),
          () =>
            db
              .from('students')
              .select('id, name')
              .eq('id', studentId)
              .maybeSingle(),
        ),
    ),
    withDivisionFallback(
      () => db.from('materials').select('id, name, is_active').eq('id', materialId).in('division', scope).maybeSingle(),
      () => db.from('materials').select('id, name, is_active').eq('id', materialId).maybeSingle(),
    ),
  ])

  if (!student) {
    return { success: false, reason: 'student_not_found' }
  }

  if (!material || !material.is_active) {
    return { success: false, reason: 'material_inactive' }
  }

  const { data: existing } = await withDivisionFallback(
    () =>
      db
        .from('distribution_logs')
        .select('id')
        .in('division', scope)
        .eq('student_id', studentId)
        .eq('material_id', materialId)
        .limit(1)
        .maybeSingle(),
    () =>
      db
        .from('distribution_logs')
        .select('id')
        .eq('student_id', studentId)
        .eq('material_id', materialId)
        .limit(1)
        .maybeSingle(),
  )

  if (existing) {
    return {
      success: false,
      reason: 'already_distributed',
      material_name: material.name,
      student_name: student.name,
    }
  }

  const { data: inserted, error } = await withDivisionFallback(
    () =>
      db
        .from('distribution_logs')
        .insert({
          division,
          student_id: studentId,
          material_id: materialId,
          distributed_by: distributedBy,
          note,
        })
        .select('id')
        .single(),
    () =>
      db
        .from('distribution_logs')
        .insert({
          student_id: studentId,
          material_id: materialId,
          distributed_by: distributedBy,
          note,
        })
        .select('id')
        .single(),
  )

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return {
        success: false,
        reason: 'already_distributed',
        material_name: material.name,
        student_name: student.name,
      }
    }
    throw error
  }

  return {
    success: true,
    log_id: inserted.id,
    material_name: material.name,
    student_name: student.name,
  }
}
