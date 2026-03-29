import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAppConfig } from '@/lib/app-config'
import { isStaffDistributionEnabled } from '@/lib/app-config.shared'
import { STAFF_COOKIE, STAFF_TTL_SEC, cookieOptions, signJwt } from '@/lib/auth/jwt'
import { checkRateLimit, getClientIp, resetRateLimit } from '@/lib/auth/rateLimiter'
import { authenticateStaffAccountWithSharedAuth } from '@/lib/auth/staff-accounts'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  loginId: z.string().trim().min(1).max(64),
  email: z.string().email().max(255),
  password: z.string().min(6).max(128),
})

export async function POST(req: NextRequest) {
  const config = await getAppConfig()
  if (!isStaffDistributionEnabled(config)) {
    return NextResponse.json(
      { error: '吏곸썝 QR ?ㅼ틪怨?鍮좊Ⅸ 諛곕? 湲곕뒫???꾩옱 紐⑤몢 鍮꾪솢?깊솕?섏뼱 ?덉뒿?덈떎.' },
      { status: 403 },
    )
  }

  const ip = getClientIp(req)
  const rl = checkRateLimit(`staff-shared:${ip}`)
  if (!rl.allowed) {
    const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000)
    return NextResponse.json(
      { error: `濡쒓렇???쒕룄 ?잛닔瑜?珥덇낵?덉뒿?덈떎. ${retryAfterSec}珥??꾩뿉 ?ㅼ떆 ?쒕룄??二쇱꽭??` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '吏곸썝 濡쒓렇??ID, ?대찓?쇨낵 6???댁긽 鍮꾨?踰덊샇瑜??낅젰??二쇱꽭??' },
      { status: 400 },
    )
  }

  try {
    const division = await getServerTenantType()
    const sharedSession = await authenticateStaffAccountWithSharedAuth({
      division,
      loginId: parsed.data.loginId,
      email: parsed.data.email,
      password: parsed.data.password,
    })

    resetRateLimit(`staff-shared:${ip}`)
    const sessionId = randomUUID()
    const token = await signJwt('staff', sessionId, {
      division,
      staffAccountId: sharedSession.accountId,
      staffLoginId: sharedSession.loginId,
      staffName: sharedSession.displayName,
      authMethod: sharedSession.authMethod,
      sharedUserId: sharedSession.sharedUserId,
      sharedLinked: sharedSession.sharedLinked,
    })

    const res = NextResponse.json({
      success: true,
      role: 'staff',
      division,
      authMethod: sharedSession.authMethod,
      staffAccountId: sharedSession.accountId,
      staffLoginId: sharedSession.loginId,
      staffName: sharedSession.displayName,
      sharedLinked: sharedSession.sharedLinked,
      sharedUserId: sharedSession.sharedUserId,
    })
    res.cookies.set(STAFF_COOKIE, token, cookieOptions(STAFF_TTL_SEC))
    return res
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '怨듯넻 ?몄쬆 濡쒓렇?몄뿉 ?ㅽ뙣?덉뒿?덈떎.' },
      { status: 401 },
    )
  }
}
