import { NextRequest, NextResponse } from 'next/server'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'

export async function GET(req: NextRequest) {
  const { payload, error } = await authenticateAdminRequest(req)
  if (error) {
    return error
  }

  if (!payload) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  return NextResponse.json({
    role: payload.role,
    division: payload.division,
    adminId: payload.adminId ?? '',
  })
}
