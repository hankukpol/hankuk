import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { invalidateCache } from '@/lib/cache/revalidate'
import { getCourseById } from '@/lib/class-pass-data'
import {
  createOpaqueDisplayToken,
  hashToken,
} from '@/lib/designated-seat/token'
import { createServerClient } from '@/lib/supabase/server'
import { withTenantPrefix } from '@/lib/tenant'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  courseId: z.number().int().positive(),
  durationHours: z.number().int().min(1).max(72).default(24),
})

export async function POST(req: NextRequest) {
  try {
    const { error: authError, payload } = await authenticateAdminRequest(req)
    if (authError) {
      return authError
    }

    const featureError = await requireAppFeature('admin_seat_management_enabled')
    if (featureError) {
      return featureError
    }

    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '현장 QR 표시 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const course = await getCourseById(parsed.data.courseId, division)
    if (!course) {
      return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    if (!course.feature_designated_seat) {
      return NextResponse.json({ error: '지정좌석 기능이 먼저 활성화되어야 합니다.' }, { status: 409 })
    }

    const db = createServerClient()
    const seatCountResult = await db
      .from('course_seats')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', course.id)

    if ((seatCountResult.count ?? 0) === 0) {
      return NextResponse.json({ error: '먼저 좌석 레이아웃을 저장해주세요.' }, { status: 409 })
    }

    const nowIso = new Date().toISOString()
    await db
      .from('course_seat_display_sessions')
      .update({ revoked_at: nowIso, last_seen_at: nowIso })
      .eq('course_id', course.id)
      .is('revoked_at', null)

    const rawToken = createOpaqueDisplayToken()
    const ttlMs = parsed.data.durationHours * 60 * 60 * 1000
    const expiresAt = new Date(Date.now() + ttlMs).toISOString()
    const insertResult = await db
      .from('course_seat_display_sessions')
      .insert({
        course_id: course.id,
        display_token_hash: hashToken(rawToken),
        created_by: payload?.adminId ?? payload?.staffName ?? 'admin',
        expires_at: expiresAt,
        last_seen_at: nowIso,
      })
      .select('*')
      .single()

    if (insertResult.error || !insertResult.data) {
      return NextResponse.json({ error: '현장 QR 표시 세션을 만들지 못했습니다.' }, { status: 500 })
    }

    await db.from('course_seat_events').insert({
      course_id: course.id,
      event_type: 'display_session_started',
      details: {
        display_session_id: insertResult.data.id,
        actor: payload?.adminId ?? payload?.staffName ?? 'admin',
      },
    })

    await invalidateCache('designated-seats')

    const displayUrl = `${req.nextUrl.origin}${withTenantPrefix(
      `/designated-seat-display/${course.id}?token=${encodeURIComponent(rawToken)}`,
      division,
    )}`

    return NextResponse.json({
      session: {
        id: insertResult.data.id,
        expires_at: expiresAt,
      },
      displayUrl,
    })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.display.POST', '현장 QR 표시를 시작하지 못했습니다.', error)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { error: authError, payload } = await authenticateAdminRequest(req)
    if (authError) {
      return authError
    }

    const featureError = await requireAppFeature('admin_seat_management_enabled')
    if (featureError) {
      return featureError
    }

    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '현장 QR 종료 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const course = await getCourseById(parsed.data.courseId, division)
    if (!course) {
      return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    const db = createServerClient()
    const nowIso = new Date().toISOString()
    await db
      .from('course_seat_display_sessions')
      .update({ revoked_at: nowIso, last_seen_at: nowIso })
      .eq('course_id', course.id)
      .is('revoked_at', null)

    await db.from('course_seat_events').insert({
      course_id: course.id,
      event_type: 'display_session_stopped',
      details: {
        actor: payload?.adminId ?? payload?.staffName ?? 'admin',
      },
    })

    await invalidateCache('designated-seats')
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.display.DELETE', '현장 QR 표시를 종료하지 못했습니다.', error)
  }
}
