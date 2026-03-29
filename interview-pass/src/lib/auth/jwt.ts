import { SignJWT, jwtVerify } from 'jose'
import type { StaffJwtPayload } from '@/types/database'
import { withConfiguredCookieDomain } from '@/lib/auth/cookie-domain'

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET!)

export const STAFF_COOKIE = 'staff_token'
export const ADMIN_COOKIE = 'admin_token'
export const STAFF_TTL_SEC = 8 * 60 * 60
export const ADMIN_TTL_SEC = 8 * 60 * 60

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
    sameSite: 'strict' as const,
    path: '/',
    maxAge: ttlSec,
  })
}

export function clearCookieOptions() {
  return withConfiguredCookieDomain({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 0,
  })
}
