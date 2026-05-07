import type { StaffJwtPayload } from '@/types/database'

export function getActorStaffId(payload: StaffJwtPayload | null) {
  return payload?.accountId ?? payload?.membershipId ?? null
}
