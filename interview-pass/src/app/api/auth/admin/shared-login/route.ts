import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ADMIN_COOKIE, ADMIN_TTL_SEC, cookieOptions, signJwt } from '@/lib/auth/jwt'
import { authenticateInterviewAdminWithSharedAuth } from '@/lib/auth/shared-auth'
import { checkRateLimit, getClientIp, resetRateLimit } from '@/lib/auth/rateLimiter'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(128),
})

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const rl = checkRateLimit(`admin-shared:${ip}`)

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
    return NextResponse.json(
      { error: '올바른 이메일과 6자 이상 비밀번호를 입력해 주세요.' },
      { status: 400 },
    )
  }

  try {
    const division = await getServerTenantType()
    const sharedSession = await authenticateInterviewAdminWithSharedAuth({
      division,
      email: parsed.data.email,
      password: parsed.data.password,
    })

    resetRateLimit(`admin-shared:${ip}`)
    const sessionId = randomUUID()
    const token = await signJwt('admin', sessionId, {
      division,
      adminId: sharedSession.adminId,
      sharedUserId: sharedSession.sharedUserId,
      sharedLinked: sharedSession.sharedLinked,
    })

    const res = NextResponse.json({
      success: true,
      role: 'admin',
      division,
      adminId: sharedSession.adminId,
      sharedLinked: sharedSession.sharedLinked,
      sharedUserId: sharedSession.sharedUserId,
    })
    res.cookies.set(ADMIN_COOKIE, token, cookieOptions(ADMIN_TTL_SEC))
    return res
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '공통 인증 로그인에 실패했습니다.' },
      { status: 401 },
    )
  }
}
