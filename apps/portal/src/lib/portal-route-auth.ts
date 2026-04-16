import { NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/portal-access'
import { getPortalSession } from '@/lib/portal-session'

export async function requirePortalApiSuperAdmin() {
  const session = await getPortalSession()

  if (!session) {
    return {
      session: null,
      response: NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 }),
    }
  }

  const allowed = await isSuperAdmin(session.userId)
  if (!allowed) {
    return {
      session: null,
      response: NextResponse.json({ error: '슈퍼 관리자 권한이 필요합니다.' }, { status: 403 }),
    }
  }

  return {
    session,
    response: null,
  }
}
