import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAppConfig } from '@/lib/app-config'
import { isStaffDistributionEnabled } from '@/lib/app-config.shared'
import { verifyPin, getPinHash } from '@/lib/auth/pin'
import { signJwt, STAFF_COOKIE, STAFF_TTL_SEC, cookieOptions } from '@/lib/auth/jwt'
import { randomUUID } from 'crypto'
import { checkRateLimit, resetRateLimit, getClientIp } from '@/lib/auth/rateLimiter'

const schema = z.object({ pin: z.string().min(1) })

export async function POST(req: NextRequest) {
  const config = await getAppConfig()
  if (!isStaffDistributionEnabled(config)) {
    return NextResponse.json(
      { error: '직원 QR 스캔과 빠른 배부 기능이 현재 모두 비활성화되어 있습니다.' },
      { status: 403 },
    )
  }

  const ip = getClientIp(req)
  const rl = checkRateLimit(`staff:${ip}`)
  if (!rl.allowed) {
    const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000)
    return NextResponse.json(
      { error: `로그인 시도 횟수를 초과했습니다. ${retryAfterSec}초 후 다시 시도해 주세요.` },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'PIN을 입력해 주세요.' }, { status: 400 })
  }

  const hash = await getPinHash('staff_pin_hash')
  if (!hash) {
    return NextResponse.json(
      { error: '직원 PIN이 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.' },
      { status: 503 }
    )
  }
  if (!(await verifyPin(parsed.data.pin, hash))) {
    return NextResponse.json({ error: '직원 PIN이 올바르지 않습니다.' }, { status: 401 })
  }

  resetRateLimit(`staff:${ip}`)
  const sessionId = randomUUID()
  const token = await signJwt('staff', sessionId)
  const res = NextResponse.json({ success: true, role: 'staff' })
  res.cookies.set(STAFF_COOKIE, token, cookieOptions(STAFF_TTL_SEC))
  return res
}
