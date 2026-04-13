import { NextRequest, NextResponse } from 'next/server'
import { authenticateSuperAdminRequest } from '@/lib/auth/authenticate'

export async function GET(req: NextRequest) {
  const { payload, error } = await authenticateSuperAdminRequest(req)
  if (error) {
    return error
  }

  return NextResponse.json({
    role: 'super_admin',
    loginId: payload?.adminId ?? '',
    accountId: payload?.accountId ?? null,
  })
}
