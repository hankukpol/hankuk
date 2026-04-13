import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ADMIN_TTL_SEC, cookieOptions, getBranchAdminCookieName, signJwt } from '@/lib/auth/jwt'
import { getPinHash, hashPin, setAdminId, setPinHash } from '@/lib/auth/pin'
import { validateSameOriginRequest } from '@/lib/auth/request-origin'
import { getSessionVersion } from '@/lib/auth/session-version'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  id: z.string().max(50).optional().default(''),
  pin: z.string().min(4).max(20),
})

const BOOTSTRAP_TOGGLE_ENV = 'CLASS_PASS_ADMIN_BOOTSTRAP_ENABLED'
const BOOTSTRAP_DISABLED_MESSAGE =
  'Bootstrap is disabled in production. Enable CLASS_PASS_ADMIN_BOOTSTRAP_ENABLED=true temporarily if needed.'

function isLocalHost(hostname: string | null | undefined) {
  if (!hostname) {
    return false
  }

  const normalized = hostname.trim().toLowerCase().split(':')[0]
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '[::1]'
}

function isBootstrapAllowed(req: NextRequest) {
  if (process.env.NODE_ENV !== 'production') {
    return true
  }

  if (process.env[BOOTSTRAP_TOGGLE_ENV] === 'true') {
    return true
  }

  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  return isLocalHost(req.nextUrl.hostname) || isLocalHost(forwardedHost)
}

export async function POST(req: NextRequest) {
  const originError = validateSameOriginRequest(req)
  if (originError) {
    return originError
  }

  const existingHash = await getPinHash('admin_pin_hash')
  if (existingHash) {
    return NextResponse.json({ error: 'Admin bootstrap is already complete.' }, { status: 409 })
  }

  if (!isBootstrapAllowed(req)) {
    return NextResponse.json({ error: BOOTSTRAP_DISABLED_MESSAGE }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Admin PIN must be 4-20 characters.' }, { status: 400 })
  }

  const adminId = parsed.data.id.trim()
  const pinHash = await hashPin(parsed.data.pin)
  await setPinHash('admin_pin_hash', pinHash)
  await setAdminId(adminId)

  const division = await getServerTenantType()
  const sessionId = randomUUID()
  const sessionVersion = await getSessionVersion('admin')
  const token = await signJwt('admin', sessionId, {
    division,
    adminId,
    authMethod: 'admin_pin',
    sessionVersion,
  })

  const response = NextResponse.json({ ok: true, division, adminId })
  response.cookies.set(getBranchAdminCookieName(division), token, cookieOptions(ADMIN_TTL_SEC))
  return response
}
