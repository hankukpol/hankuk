import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ADMIN_TTL_SEC, cookieOptions, getBranchAdminCookieName, signJwt } from '@/lib/auth/jwt'
import { getAdminId, getPinHash, verifyPin } from '@/lib/auth/pin'
import { validateSameOriginRequest } from '@/lib/auth/request-origin'
import { checkRateLimit, getClientIp, resetRateLimit } from '@/lib/auth/rateLimiter'
import { getSessionVersion } from '@/lib/auth/session-version'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  id: z.string().optional().default(''),
  pin: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const originError = validateSameOriginRequest(req)
  if (originError) {
    return originError
  }

  const ip = getClientIp(req)
  const rateLimit = checkRateLimit(`admin:${ip}`)

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
    return NextResponse.json({ error: 'Invalid input.' }, { status: 400 })
  }

  try {
    const adminId = await getAdminId()
    if (adminId && parsed.data.id.trim() !== adminId) {
      return NextResponse.json({ error: 'Invalid admin credentials.' }, { status: 401 })
    }

    const hash = await getPinHash('admin_pin_hash')
    if (!hash || !(await verifyPin(parsed.data.pin, hash))) {
      return NextResponse.json({ error: 'Invalid admin credentials.' }, { status: 401 })
    }

    resetRateLimit(`admin:${ip}`)
    const division = await getServerTenantType()
    const sessionId = randomUUID()
    const sessionVersion = await getSessionVersion('admin')
    const token = await signJwt('admin', sessionId, {
      division,
      adminId,
      authMethod: 'admin_pin',
      sessionVersion,
    })

    const response = NextResponse.json({ success: true, division, adminId })
    response.cookies.set(getBranchAdminCookieName(division), token, cookieOptions(ADMIN_TTL_SEC))
    return response
  } catch {
    return NextResponse.json({ error: 'Authentication failed.' }, { status: 500 })
  }
}
