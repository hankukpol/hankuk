export const ACTIVE_STUDENT_STATUS = 'active'
export const REFUNDED_STUDENT_STATUS = 'refunded'

export type StudentStatus =
  | typeof ACTIVE_STUDENT_STATUS
  | typeof REFUNDED_STUDENT_STATUS

type LegacyStudentLike = Record<string, unknown>

export function applyLegacyStudentStatus<T extends LegacyStudentLike>(student: T): T & {
  status: typeof ACTIVE_STUDENT_STATUS
  refunded_at: null
  refund_note: null
} {
  return {
    ...student,
    status: ACTIVE_STUDENT_STATUS,
    refunded_at: null,
    refund_note: null,
  }
}

export function applyLegacyStudentStatusList<T extends LegacyStudentLike>(students: T[] | null | undefined) {
  return (students ?? []).map((student) => applyLegacyStudentStatus(student))
}
