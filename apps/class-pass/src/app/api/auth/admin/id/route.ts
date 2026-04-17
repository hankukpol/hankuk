import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { ADMIN_TTL_SEC, cookieOptions, getBranchAdminCookieName, signJwt } from '@/lib/auth/jwt'
import { getAdminId, setAdminId } from '@/lib/auth/pin'
import { rotateSessionVersion } from '@/lib/auth/session-version'

const schema = z.object({
  id: z.string().max(50),
})

export async function GET(req: NextRequest) {
  const { error } = await authenticateAdminRequest(req)
  if (error) {
    return error
  }

  return NextResponse.json({ id: await getAdminId() })
}

export async function PATCH(req: NextRequest) {
  const { payload, error } = await authenticateAdminRequest(req)
  if (error) {
    return error
  }

  if (!payload) {
    return NextResponse.json({ error: '포털에서 인증이 필요합니다.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '관리자 ID는 50자 이하로 입력해 주세요.' }, { status: 400 })
  }

  const adminId = parsed.data.id.trim()
  await setAdminId(adminId)
  const sessionVersion = await rotateSessionVersion('admin')
  const token = await signJwt('admin', randomUUID(), {
    division: payload.division,
    adminId,
    authMethod: 'admin_pin',
    sessionVersion,
  })

  const response = NextResponse.json({ success: true, adminId })
  response.cookies.set(getBranchAdminCookieName(payload.division ?? 'police'), token, cookieOptions(ADMIN_TTL_SEC))
  return response
}
