import { NextRequest, NextResponse } from 'next/server'
import { validateSameOriginRequest } from '@/lib/auth/request-origin'
import { clearSuperAdminSessionCookie } from '@/lib/auth/session-cookies'
import { authenticateSuperAdminRequest } from '@/lib/auth/authenticate'
import { revokeOperatorSession } from '@/lib/auth/operator-sessions'

export async function POST(req: NextRequest) {
  const originError = validateSameOriginRequest(req)
  if (originError) {
    return originError
  }

  const { payload } = await authenticateSuperAdminRequest(req)
  if (payload?.sub) {
    await revokeOperatorSession(payload.sub).catch(() => null)
  }

  const response = NextResponse.json({ success: true })
  clearSuperAdminSessionCookie(response)
  return response
}
