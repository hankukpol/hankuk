import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_COOKIE, clearCookieOptions, getBranchAdminCookieName } from '@/lib/auth/jwt'
import { validateSameOriginRequest } from '@/lib/auth/request-origin'
import { getServerTenantType } from '@/lib/tenant.server'

export async function POST(req: NextRequest) {
  const originError = validateSameOriginRequest(req)
  if (originError) {
    return originError
  }

  const division = await getServerTenantType()
  const response = NextResponse.json({ success: true })
  response.cookies.set(getBranchAdminCookieName(division), '', clearCookieOptions())
  response.cookies.set(ADMIN_COOKIE, '', clearCookieOptions())
  return response
}
