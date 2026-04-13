import { SignJWT, jwtVerify } from 'jose'
import type { NextRequest, NextResponse } from 'next/server'
import { withConfiguredCookieDomain } from '@/lib/auth/cookie-domain'
import { hashToken } from '@/lib/designated-seat/token'

export const DESIGNATED_SEAT_DEVICE_COOKIE = 'class_pass_designated_device'
const DEVICE_COOKIE_TTL_SEC = 60 * 60 * 24 * 90

function getSecretValue() {
  const secret =
    process.env.DESIGNATED_SEAT_SECRET?.trim()
    || process.env.JWT_SECRET?.trim()
    || process.env.QR_HMAC_SECRET?.trim()

  if (!secret || secret.length < 32) {
    throw new Error('A designated-seat device secret of at least 32 characters is required.')
  }

  return secret
}

async function getSecretKey() {
  return new TextEncoder().encode(getSecretValue())
}

function isValidDeviceKey(value: string) {
  return /^[A-Za-z0-9_-]{16,128}$/.test(value)
}

async function signDeviceCookie(deviceKey: string) {
  return new SignJWT({ kind: 'designated-seat-device' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(deviceKey)
    .setIssuedAt()
    .setExpirationTime(`${DEVICE_COOKIE_TTL_SEC}s`)
    .sign(await getSecretKey())
}

async function verifyDeviceCookie(token: string) {
  try {
    const { payload } = await jwtVerify(token, await getSecretKey())
    const deviceKey = payload.sub
    return typeof deviceKey === 'string' && isValidDeviceKey(deviceKey) ? deviceKey : null
  } catch {
    return null
  }
}

export type DeviceResolutionResult =
  | {
    ok: true
    deviceKey: string
    deviceHash: string
    cookieToSet: string | null
  }
  | {
    ok: false
    reason: 'INVALID_LOCAL_KEY' | 'DEVICE_MISMATCH'
  }

export async function resolveStudentDevice(
  req: NextRequest,
  localDeviceKey: string,
): Promise<DeviceResolutionResult> {
  const normalizedLocalKey = String(localDeviceKey || '').trim()
  if (!isValidDeviceKey(normalizedLocalKey)) {
    return { ok: false, reason: 'INVALID_LOCAL_KEY' }
  }

  const cookieValue = req.cookies.get(DESIGNATED_SEAT_DEVICE_COOKIE)?.value
  const cookieDeviceKey = cookieValue ? await verifyDeviceCookie(cookieValue) : null

  if (cookieValue && !cookieDeviceKey) {
    return { ok: false, reason: 'DEVICE_MISMATCH' }
  }

  if (cookieDeviceKey && cookieDeviceKey !== normalizedLocalKey) {
    return { ok: false, reason: 'DEVICE_MISMATCH' }
  }

  const resolvedDeviceKey = cookieDeviceKey ?? normalizedLocalKey
  return {
    ok: true,
    deviceKey: resolvedDeviceKey,
    deviceHash: hashToken(resolvedDeviceKey),
    cookieToSet: cookieDeviceKey ? null : await signDeviceCookie(resolvedDeviceKey),
  }
}

export async function readStudentDeviceHashFromRequest(req: NextRequest) {
  const cookieValue = req.cookies.get(DESIGNATED_SEAT_DEVICE_COOKIE)?.value
  if (!cookieValue) {
    return null
  }

  const deviceKey = await verifyDeviceCookie(cookieValue)
  return deviceKey ? hashToken(deviceKey) : null
}

export function attachStudentDeviceCookie(response: NextResponse, cookieValue: string) {
  response.cookies.set(
    DESIGNATED_SEAT_DEVICE_COOKIE,
    cookieValue,
    withConfiguredCookieDomain({
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
      maxAge: DEVICE_COOKIE_TTL_SEC,
    }),
  )

  return response
}
