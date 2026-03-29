import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifyJwt } from '@/lib/auth/jwt'
import { requireAdminApi } from '@/lib/auth/require-admin-api'

export async function GET(req: NextRequest) {
  const guard = await requireAdminApi(req)
  if (guard) return guard

  const token = req.cookies.get(ADMIN_COOKIE)?.value
  const payload = token ? await verifyJwt(token) : null

  if (!payload || payload.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  return NextResponse.json({
    role: payload.role,
    division: payload.division ?? null,
    adminId: payload.adminId ?? '',
    sharedLinked: Boolean(payload.sharedLinked),
    sharedUserId: payload.sharedUserId ?? null,
  })
}
