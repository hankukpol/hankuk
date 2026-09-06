import type { Enrollment } from '@/types/database'

// Billing is deliberately not an access condition: active unpaid enrollments are valid.
export function isStudentEnrollmentEligible(enrollment: Pick<Enrollment, 'status' | 'suspended_at'>) {
  return enrollment.status === 'active' && !enrollment.suspended_at
}
