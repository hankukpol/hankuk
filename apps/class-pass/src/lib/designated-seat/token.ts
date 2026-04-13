import { createHash, createHmac, randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import type { DesignatedSeatRotationTokenPayload } from '@/types/database'

export const DESIGNATED_SEAT_ROTATION_MS = 15_000
export const DESIGNATED_SEAT_AUTH_TTL_MS = 2 * 60 * 1000
const DESIGNATED_SEAT_ROTATION_CLOCK_TOLERANCE_S = 5

function getSecretValue() {
  const secret =
    process.env.DESIGNATED_SEAT_SECRET?.trim()
    || process.env.QR_HMAC_SECRET?.trim()
    || process.env.JWT_SECRET?.trim()

  if (!secret || secret.length < 32) {
    throw new Error('A designated-seat signing secret of at least 32 characters is required.')
  }

  return secret
}

async function getSecretKey() {
  return new TextEncoder().encode(getSecretValue())
}

export function getRotationBucket(at = Date.now()) {
  return Math.floor(at / DESIGNATED_SEAT_ROTATION_MS)
}

export function createOpaqueDisplayToken() {
  return randomBytes(32).toString('base64url')
}

export function hashToken(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export async function generateRotationToken(params: {
  courseId: number
  displaySessionId: number
  rotation?: number
}) {
  const now = Date.now()
  const rotation = params.rotation ?? getRotationBucket(now)

  return new SignJWT({
    courseId: params.courseId,
    displaySessionId: params.displaySessionId,
    rotation,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor((now + DESIGNATED_SEAT_ROTATION_MS) / 1000))
    .sign(await getSecretKey())
}

export async function verifyRotationToken(token: string): Promise<DesignatedSeatRotationTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, await getSecretKey(), {
      clockTolerance: DESIGNATED_SEAT_ROTATION_CLOCK_TOLERANCE_S,
    })
    return payload as unknown as DesignatedSeatRotationTokenPayload
  } catch {
    return null
  }
}

export function generateRotationCode(params: {
  displaySessionId: number
  courseId: number
  rotation?: number
}) {
  const rotation = params.rotation ?? getRotationBucket()
  const digest = createHmac('sha256', getSecretValue())
    .update(`${params.displaySessionId}:${params.courseId}:${rotation}:designated-seat-code`)
    .digest('hex')

  return String(Number.parseInt(digest.slice(0, 10), 16) % 1_000_000).padStart(6, '0')
}
