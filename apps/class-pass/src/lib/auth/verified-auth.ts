import type { StaffJwtPayload } from '@/types/database'

// Middleware metadata is not an authentication credential. Route guards verify signed cookies.
export const VERIFIED_ADMIN_HEADER = 'x-hankuk-verified-admin'
export const VERIFIED_STAFF_HEADER = 'x-hankuk-verified-staff'
export const VERIFIED_SUPER_ADMIN_HEADER = 'x-hankuk-verified-super-admin'

export function encodeVerifiedPayload(payload: StaffJwtPayload) {
  return encodeURIComponent(JSON.stringify(payload))
}
