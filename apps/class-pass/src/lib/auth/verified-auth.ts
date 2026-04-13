import type { NextRequest } from 'next/server'
import type { StaffJwtPayload } from '@/types/database'

export const VERIFIED_ADMIN_HEADER = 'x-hankuk-verified-admin'
export const VERIFIED_STAFF_HEADER = 'x-hankuk-verified-staff'
export const VERIFIED_SUPER_ADMIN_HEADER = 'x-hankuk-verified-super-admin'

function parseVerifiedPayload(value: string | null | undefined) {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as StaffJwtPayload | null
    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function encodeVerifiedPayload(payload: StaffJwtPayload) {
  return encodeURIComponent(JSON.stringify(payload))
}

export function readVerifiedAdminPayload(req: NextRequest) {
  return parseVerifiedPayload(req.headers.get(VERIFIED_ADMIN_HEADER))
}

export function readVerifiedStaffPayload(req: NextRequest) {
  return parseVerifiedPayload(req.headers.get(VERIFIED_STAFF_HEADER))
}

export function readVerifiedSuperAdminPayload(req: NextRequest) {
  return parseVerifiedPayload(req.headers.get(VERIFIED_SUPER_ADMIN_HEADER))
}
