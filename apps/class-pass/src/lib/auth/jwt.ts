import { SignJWT, jwtVerify } from 'jose'
import type { StaffJwtPayload } from '@/types/database'
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

const secret = () => {
  const jwt = process.env.JWT_SECRET
  if (!jwt || jwt.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters.')
  }
  return new TextEncoder().encode(jwt)
}

export const STAFF_TTL_SEC = 8 * 60 * 60
export const ADMIN_TTL_SEC = 8 * 60 * 60
const SESSION_SAME_SITE = 'lax' as const

type JwtClaims = Omit<StaffJwtPayload, 'role' | 'sub' | 'iat' | 'exp'>

export async function signJwt(
  role: 'staff' | 'admin',
  sessionId: string,
  claims: JwtClaims = {},
): Promise<string> {
  const ttl = role === 'admin' ? ADMIN_TTL_SEC : STAFF_TTL_SEC

  return new SignJWT({ role, sub: sessionId, ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(await secret())
}

export async function verifyJwt(token: string): Promise<StaffJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, await secret())
    return payload as unknown as StaffJwtPayload
  } catch {
    return null
  }
}

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
}
