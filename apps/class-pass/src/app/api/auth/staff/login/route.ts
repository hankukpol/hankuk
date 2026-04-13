import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { STAFF_TTL_SEC, cookieOptions, getBranchStaffCookieName, signJwt } from '@/lib/auth/jwt'
import { getPinHash, verifyPin } from '@/lib/auth/pin'
import { validateSameOriginRequest } from '@/lib/auth/request-origin'
import { checkRateLimit, getClientIp, resetRateLimit } from '@/lib/auth/rateLimiter'
import { getSessionVersion } from '@/lib/auth/session-version'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  pin: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const originError = validateSameOriginRequest(req)
  if (originError) {
    return originError
  }

  const ip = getClientIp(req)
  const rateLimit = checkRateLimit(`staff:${ip}`)

  if (!rateLimit.allowed) {
    const retryAfterSec = Math.ceil(rateLimit.retryAfterMs / 1000)
    return NextResponse.json(
      { error: `Too many login attempts. Try again in ${retryAfterSec}s.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Staff PIN is required.' }, { status: 400 })
  }

  const hash = await getPinHash('staff_pin_hash')
  if (!hash) {
    return NextResponse.json({ error: 'Staff PIN is not configured yet.' }, { status: 503 })
  }

  if (!(await verifyPin(parsed.data.pin, hash))) {
    return NextResponse.json({ error: 'Invalid staff PIN.' }, { status: 401 })
  }

  resetRateLimit(`staff:${ip}`)
  const division = await getServerTenantType()
  const sessionId = randomUUID()
  const sessionVersion = await getSessionVersion('staff')
  const token = await signJwt('staff', sessionId, {
    division,
    authMethod: 'staff_pin',
    sessionVersion,
  })

  const response = NextResponse.json({ success: true, division, role: 'staff' })
  response.cookies.set(getBranchStaffCookieName(division), token, cookieOptions(STAFF_TTL_SEC))
  return response
}
