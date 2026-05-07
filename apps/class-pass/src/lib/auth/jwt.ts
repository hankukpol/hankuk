import { withConfiguredCookieDomain } from '@/lib/auth/cookie-domain'
import {
  ADMIN_COOKIE,
  getAdminCookieCandidates,
  getBranchAdminCookieName,
  getBranchStaffCookieName,
  getStaffCookieCandidates,
  STAFF_COOKIE,
  SUPER_ADMIN_COOKIE,
} from '@/lib/auth/cookie-names'
import { ADMIN_TTL_SEC, STAFF_TTL_SEC, signJwt, verifyJwt } from '@/lib/auth/jwt-core'

const SESSION_SAME_SITE = 'lax' as const

export function cookieOptions(ttlSec: number) {
  return withConfiguredCookieDomain({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Portal bridge relies on a cross-site POST -> redirect login flow.
    sameSite: SESSION_SAME_SITE,
    path: '/',
    maxAge: ttlSec,
  })
}

export function clearCookieOptions() {
  return withConfiguredCookieDomain({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: SESSION_SAME_SITE,
    path: '/',
    maxAge: 0,
  })
}

export {
  ADMIN_COOKIE,
  getAdminCookieCandidates,
  getBranchAdminCookieName,
  getBranchStaffCookieName,
  getStaffCookieCandidates,
  STAFF_COOKIE,
  SUPER_ADMIN_COOKIE,
  ADMIN_TTL_SEC,
  STAFF_TTL_SEC,
  signJwt,
  verifyJwt,
}
