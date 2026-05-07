import { SignJWT, jwtVerify } from 'jose'
import type { StaffJwtPayload } from '@/types/database'

const secret = () => {
  const jwt = process.env.JWT_SECRET
  if (!jwt || jwt.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters.')
  }
  return new TextEncoder().encode(jwt)
}

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
    const { payload } = await jwtVerify(token, await secret(), { algorithms: ['HS256'] })
    return payload as unknown as StaffJwtPayload
  } catch {
    return null
  }
}
