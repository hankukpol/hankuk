import { NextRequest, NextResponse } from 'next/server'
import { STAFF_COOKIE, clearCookieOptions, getBranchStaffCookieName } from '@/lib/auth/jwt'
import { validateSameOriginRequest } from '@/lib/auth/request-origin'
import { getServerTenantType } from '@/lib/tenant.server'

export async function POST(req: NextRequest) {
  const originError = validateSameOriginRequest(req)
  if (originError) {
    return originError
  }

  const division = await getServerTenantType()
  const response = NextResponse.json({ success: true })
  response.cookies.set(getBranchStaffCookieName(division), '', clearCookieOptions())
  response.cookies.set(STAFF_COOKIE, '', clearCookieOptions())
  return response
}
