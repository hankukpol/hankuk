import type { StaffJwtPayload } from '@/types/database'

export function getDistributionActorLabel(payload: StaffJwtPayload | null) {
  if (!payload) {
    return '직원'
  }

  if (payload.role === 'admin') {
    return payload.adminId ? `관리자 (${payload.adminId})` : '관리자'
  }

  if (payload.staffName) {
    return payload.staffLoginId
      ? `${payload.staffName} (${payload.staffLoginId})`
      : payload.staffName
  }

  return '공용 직원 PIN'
}
