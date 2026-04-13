import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { ADMIN_TTL_SEC, cookieOptions, getBranchAdminCookieName, signJwt } from '@/lib/auth/jwt'
import { hashPin, setPinHash } from '@/lib/auth/pin'
import { rotateSessionVersion } from '@/lib/auth/session-version'

const schema = z.object({
  pin: z.string().min(4).max(20),
})

export async function PATCH(req: NextRequest) {
  const { payload, error } = await authenticateAdminRequest(req)
  if (error) {
    return error
  }

  if (!payload) {
    return NextResponse.json({ error: 'Admin authentication required.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Admin PIN must be 4-20 characters.' }, { status: 400 })
  }

  await setPinHash('admin_pin_hash', await hashPin(parsed.data.pin))
  const sessionVersion = await rotateSessionVersion('admin')
  const token = await signJwt('admin', randomUUID(), {
    division: payload.division,
    adminId: payload.adminId ?? '',
    authMethod: 'admin_pin',
    sessionVersion,
  })

  const response = NextResponse.json({ success: true })
  response.cookies.set(getBranchAdminCookieName(payload.division ?? 'police'), token, cookieOptions(ADMIN_TTL_SEC))
  return response
}
