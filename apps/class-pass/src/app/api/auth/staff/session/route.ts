import { NextRequest, NextResponse } from 'next/server'
import { authenticateStaffRequest } from '@/lib/auth/authenticate'

export async function GET(req: NextRequest) {
  const { payload, actingRole, error } = await authenticateStaffRequest(req)
  if (error) {
    return error
  }

  if (!payload || !actingRole) {
    return NextResponse.json({ error: '직원 인증이 필요합니다.' }, { status: 401 })
  }

  if (actingRole === 'staff') {
    return NextResponse.json({
      role: 'staff',
      division: payload.division,
    })
  }

  return NextResponse.json({
    role: 'admin',
    division: payload.division,
    adminId: payload.adminId ?? '',
  })
}
