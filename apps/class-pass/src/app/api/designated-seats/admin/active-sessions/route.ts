import { NextRequest, NextResponse } from 'next/server'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const featureError = await requireAppFeature('admin_seat_management_enabled')
    if (featureError) return featureError

    const division = await getServerTenantType()
    const db = createServerClient()

    const { data: courses } = await db
      .from('courses')
      .select('id,name')
      .eq('division', division)

    const courseIds = (courses ?? []).map((course) => course.id)
    if (courseIds.length === 0) {
      return NextResponse.json({ sessions: [] })
    }

    const courseMap = new Map((courses ?? []).map((course) => [course.id, course.name]))
    const { data: sessions } = await db
      .from('course_seat_display_sessions')
      .select('id,course_id,display_token_hash,expires_at,created_at')
      .in('course_id', courseIds)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    const result = (sessions ?? []).map((session) => ({
      courseId: session.course_id,
      courseName: courseMap.get(session.course_id) ?? `강좌 #${session.course_id}`,
      sessionId: session.id,
      expiresAt: session.expires_at,
    }))

    return NextResponse.json({ sessions: result })
  } catch (error) {
    return handleRouteError(
      'designatedSeats.admin.activeSessions',
      '활성 현장 QR 세션 목록을 불러오지 못했습니다.',
      error,
    )
  }
}
