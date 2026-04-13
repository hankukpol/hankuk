import { withTenantPrefix } from '@/lib/tenant'
import type { TenantType } from '@/lib/tenant'
import type { DesignatedSeatStudentState } from '@/types/database'

export async function fetchDesignatedSeatState(params: {
  tenantType: TenantType
  courseId: number
  enrollmentId: number
  name: string
  phone: string
}) {
  const response = await fetch(withTenantPrefix('/api/designated-seats/state', params.tenantType), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      courseId: params.courseId,
      enrollmentId: params.enrollmentId,
      name: params.name,
      phone: params.phone,
    }),
  })

  const result = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error((result as { error?: string } | null)?.error ?? '지정좌석 상태를 새로고침하지 못했습니다.')
  }

  return (result as { state: DesignatedSeatStudentState }).state
}
