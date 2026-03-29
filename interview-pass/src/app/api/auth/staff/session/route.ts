import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, STAFF_COOKIE, verifyJwt } from '@/lib/auth/jwt'

export async function GET(req: NextRequest) {
  const staffToken = req.cookies.get(STAFF_COOKIE)?.value
  const adminToken = req.cookies.get(ADMIN_COOKIE)?.value
  const payload = staffToken
    ? await verifyJwt(staffToken)
    : adminToken
      ? await verifyJwt(adminToken)
      : null

  if (!payload || (payload.role !== 'staff' && payload.role !== 'admin')) {
    return NextResponse.json({ error: '직원 인증이 필요합니다.' }, { status: 403 })
  }

  return NextResponse.json({
    role: payload.role,
    division: payload.division ?? null,
    authMethod: payload.authMethod ?? null,
    adminId: payload.adminId ?? '',
    staffAccountId: payload.staffAccountId ?? null,
    staffLoginId: payload.staffLoginId ?? '',
    staffName: payload.staffName ?? '',
    sharedLinked: Boolean(payload.sharedLinked),
    sharedUserId: payload.sharedUserId ?? null,
  })
}
