import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ADMIN_COOKIE, ADMIN_TTL_SEC, cookieOptions, signJwt } from '@/lib/auth/jwt'
import { getPinHash, hashPin, setAdminId, setPinHash } from '@/lib/auth/pin'
import { getInterviewAdminSessionContext } from '@/lib/auth/shared-auth'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  id: z.string().max(50).optional().default(''),
  pin: z.string().min(4).max(20),
})

export async function GET() {
  const hash = await getPinHash('admin_pin_hash')
  return NextResponse.json({ configured: Boolean(hash) })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '관리자 PIN은 4~20자리여야 합니다.' }, { status: 400 })
  }

  const existingHash = await getPinHash('admin_pin_hash')
  if (existingHash) {
    return NextResponse.json({ error: '관리자 설정이 이미 완료되었습니다.' }, { status: 409 })
  }

  const adminId = parsed.data.id.trim()
  const pinHash = await hashPin(parsed.data.pin)

  await setPinHash('admin_pin_hash', pinHash)
  if (adminId) {
    await setAdminId(adminId)
  }

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
    ok: true,
    division,
    adminId,
    sharedLinked: sharedSession.sharedLinked,
    sharedUserId: sharedSession.sharedUserId,
  })
  res.cookies.set(ADMIN_COOKIE, token, cookieOptions(ADMIN_TTL_SEC))
  return res
}
