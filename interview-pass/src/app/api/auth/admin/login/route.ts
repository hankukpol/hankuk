import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { signJwt, ADMIN_COOKIE, ADMIN_TTL_SEC, cookieOptions } from '@/lib/auth/jwt'
import { getAdminId, getPinHash, verifyPin } from '@/lib/auth/pin'
import { getInterviewAdminSessionContext } from '@/lib/auth/shared-auth'
import { checkRateLimit, getClientIp, resetRateLimit } from '@/lib/auth/rateLimiter'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  id: z.string().optional().default(''),
  pin: z.string().min(1),
})

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const rl = checkRateLimit(`admin:${ip}`)

  if (!rl.allowed) {
    const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000)
    return NextResponse.json(
      { error: `로그인 시도 횟수를 초과했습니다. ${retryAfterSec}초 후에 다시 시도해 주세요.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: '입력값을 확인해 주세요.' }, { status: 400 })
  }

  const adminId = await getAdminId()
  if (adminId && parsed.data.id !== adminId) {
    return NextResponse.json({ error: '관리자 정보가 올바르지 않습니다.' }, { status: 401 })
  }

  const hash = await getPinHash('admin_pin_hash')
  if (!hash || !(await verifyPin(parsed.data.pin, hash))) {
    return NextResponse.json({ error: '관리자 정보가 올바르지 않습니다.' }, { status: 401 })
  }

  resetRateLimit(`admin:${ip}`)

  const division = await getServerTenantType()
  const sharedSession = await getInterviewAdminSessionContext(division)
  const sessionId = randomUUID()
  const token = await signJwt('admin', sessionId, {
    division,
    adminId,
    sharedUserId: sharedSession.sharedUserId,
    sharedLinked: sharedSession.sharedLinked,
  })

  const res = NextResponse.json({
    success: true,
    role: 'admin',
    division,
    adminId,
    sharedLinked: sharedSession.sharedLinked,
    sharedUserId: sharedSession.sharedUserId,
  })
  res.cookies.set(ADMIN_COOKIE, token, cookieOptions(ADMIN_TTL_SEC))
  return res
}
