import type { Enrollment, EnrollmentLifecycleStatus } from '@/types/database'

export function getEnrollmentLifecycleStatus(
  enrollment: Pick<Enrollment, 'status' | 'suspended_at'>,
): EnrollmentLifecycleStatus {
  if (enrollment.status === 'active' && Boolean(enrollment.suspended_at)) {
    return 'suspended'
  }

  return enrollment.status
}
