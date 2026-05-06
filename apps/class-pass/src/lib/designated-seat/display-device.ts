import { createHmac, randomBytes, randomInt } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import type { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/designated-seat/token'
import type { DesignatedSeatDisplayDevice } from '@/types/database'

export const DESIGNATED_SEAT_DISPLAY_DEVICE_COOKIE = 'class_pass_designated_display_device'
export const DISPLAY_DEVICE_REGISTRATION_CODE_TTL_MS = 10 * 60 * 1000
const DISPLAY_DEVICE_COOKIE_EXPIRES = new Date('9999-12-31T23:59:59.000Z')

export function getDesignatedSeatDisplayDeviceCookieName(courseId: number) {
  return `${DESIGNATED_SEAT_DISPLAY_DEVICE_COOKIE}_${courseId}`
}

function getSecretValue() {
  const secret =
    process.env.DESIGNATED_SEAT_SECRET?.trim()
    || process.env.QR_HMAC_SECRET?.trim()
    || process.env.JWT_SECRET?.trim()

  if (!secret || secret.length < 32) {
    throw new Error('A designated-seat display device secret of at least 32 characters is required.')
  }

  return secret
}

async function getSecretKey() {
  return new TextEncoder().encode(getSecretValue())
}

function isValidDisplayDeviceToken(value: string) {
  return /^[A-Za-z0-9_-]{32,128}$/.test(value)
}

export function createDisplayDeviceToken() {
  return randomBytes(32).toString('base64url')
}

export function generateDisplayRegistrationCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function hashDisplayRegistrationCode(courseId: number, code: string) {
  return createHmac('sha256', getSecretValue())
    .update(`${courseId}:${code.trim()}:designated-seat-display-registration`)
    .digest('hex')
}

async function signDisplayDeviceCookie(deviceToken: string) {
  return new SignJWT({ kind: 'designated-seat-display-device' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(deviceToken)
    .setIssuedAt()
    .sign(await getSecretKey())
}

async function verifyDisplayDeviceCookie(token: string) {
  try {
    const { payload } = await jwtVerify(token, await getSecretKey())
    const deviceToken = payload.sub
    return typeof deviceToken === 'string' && isValidDisplayDeviceToken(deviceToken)
      ? deviceToken
      : null
  } catch {
    return null
  }
}

export type DisplayDeviceResolution =
  | {
    ok: true
    device: DesignatedSeatDisplayDevice
    deviceTokenHash: string
  }
  | {
    ok: false
    reason: 'MISSING_COOKIE' | 'INVALID_COOKIE' | 'DEVICE_NOT_REGISTERED'
  }

export async function resolveDisplayDevice(
  req: NextRequest,
  courseId: number,
): Promise<DisplayDeviceResolution> {
  const cookieValue =
    req.cookies.get(getDesignatedSeatDisplayDeviceCookieName(courseId))?.value
    ?? req.cookies.get(DESIGNATED_SEAT_DISPLAY_DEVICE_COOKIE)?.value
  if (!cookieValue) {
    return { ok: false, reason: 'MISSING_COOKIE' }
  }

  const deviceToken = await verifyDisplayDeviceCookie(cookieValue)
  if (!deviceToken) {
    return { ok: false, reason: 'INVALID_COOKIE' }
  }

  const deviceTokenHash = hashToken(deviceToken)
  const db = createServerClient()
  const result = await db
    .from('course_seat_display_devices')
    .select('*')
    .eq('course_id', courseId)
    .eq('device_token_hash', deviceTokenHash)
    .is('revoked_at', null)
    .maybeSingle()

  if (result.error || !result.data) {
    return { ok: false, reason: 'DEVICE_NOT_REGISTERED' }
  }

  return {
    ok: true,
    device: result.data as DesignatedSeatDisplayDevice,
    deviceTokenHash,
  }
}

export async function createDisplayDeviceCookie(deviceToken: string) {
  return signDisplayDeviceCookie(deviceToken)
}

export function attachDisplayDeviceCookie(response: NextResponse, courseId: number, cookieValue: string) {
  response.cookies.set(
    getDesignatedSeatDisplayDeviceCookieName(courseId),
    cookieValue,
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
      expires: DISPLAY_DEVICE_COOKIE_EXPIRES,
    },
  )

  return response
}

export function clearDisplayDeviceCookie(response: NextResponse, courseId?: number) {
  const clearOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 0,
  }

  if (typeof courseId === 'number') {
    response.cookies.set(getDesignatedSeatDisplayDeviceCookieName(courseId), '', clearOptions)
  }

  response.cookies.set(DESIGNATED_SEAT_DISPLAY_DEVICE_COOKIE, '', clearOptions)

  return response
}
