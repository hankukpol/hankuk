import { NextRequest, NextResponse } from 'next/server'
import { validateSameOriginRequest } from '@/lib/auth/request-origin'
import { clearStudentSessionCookie } from '@/lib/auth/student-session'
import { getServerTenantType } from '@/lib/tenant.server'

export async function POST(req: NextRequest) {
  const originError = validateSameOriginRequest(req)
  if (originError) return originError
  return clearStudentSessionCookie(NextResponse.json({ ok: true }), await getServerTenantType())
}
