import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, verifyJwt } from '@/lib/auth/jwt'

export async function requireAdminApi(req: NextRequest) {
  const token = req.cookies.get(ADMIN_COOKIE)?.value
  const payload = token ? await verifyJwt(token) : null

  if (!payload || payload.role !== 'admin') {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  return null
}
