import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import {
  buildDisplayUrlForTarget,
  resolveDesignatedSeatDisplayTarget,
} from '@/lib/designated-seat/display-targets'
import {
  ensureCourseRooms,
  getActiveDisplaySessionForDisplayTarget,
} from '@/lib/designated-seat/service'
import {
  createOpaqueDisplayToken,
  hashToken,
} from '@/lib/designated-seat/token'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import type { CourseRoom } from '@/types/database'

const schema = z.object({
  courseId: z.number().int().positive().optional().nullable(),
  slotKey: z.string().trim().min(1).max(80).optional().nullable(),
  roomId: z.number().int().positive().optional().nullable(),
  durationHours: z.number().int().min(1).max(72).default(24),
}).refine((value) => Boolean(value.courseId) !== Boolean(value.slotKey), {
  message: 'Exactly one display target is required.',
})

const querySchema = z.object({
  courseId: z.coerce.number().int().positive().optional().nullable(),
  slotKey: z.string().trim().min(1).max(80).optional().nullable(),
  roomId: z.coerce.number().int().positive().optional().nullable(),
}).refine((value) => Boolean(value.courseId) !== Boolean(value.slotKey), {
  message: 'Exactly one display target is required.',
})

function pickDisplayRoom(rooms: CourseRoom[], roomId?: number | null) {
  if (roomId) {
    const room = rooms.find((entry) => entry.id === roomId) ?? null
    return room
      ? { kind: 'resolved' as const, room }
      : { kind: 'not_found' as const }
  }

  const openRooms = rooms.filter((entry) => entry.is_open)
  if (openRooms.length === 1) {
    return { kind: 'resolved' as const, room: openRooms[0] }
  }

  if (openRooms.length > 1) {
    return { kind: 'room_required' as const }
  }

  if (rooms.length === 1) {
    return { kind: 'resolved' as const, room: rooms[0] }
  }

  return { kind: 'room_required' as const }
}

async function resolveDisplayRoom(courseId: number, roomId?: number | null) {
  const rooms = await ensureCourseRooms(courseId)
  return pickDisplayRoom(rooms, roomId)
}

async function requireDisplayTarget(req: NextRequest, input: { courseId?: number | null; slotKey?: string | null }) {
  const { error: authError, payload } = await authenticateAdminRequest(req)
  if (authError) {
    return { response: authError, target: null, payload: null, division: null }
  }

  const featureError = await requireAppFeature('admin_seat_management_enabled')
  if (featureError) {
    return { response: featureError, target: null, payload: null, division: null }
  }

  const division = await getServerTenantType()
  const target = await resolveDesignatedSeatDisplayTarget({
    courseId: input.courseId,
    slotKey: input.slotKey,
    division,
  })
  if (!target) {
    return {
      response: NextResponse.json({ error: 'QR 표시 대상을 찾을 수 없습니다.' }, { status: 404 }),
      target: null,
      payload: null,
      division: null,
    }
  }

  return { response: null, target, payload, division }
}

export async function GET(req: NextRequest) {
  try {
    const parsed = querySchema.safeParse({
      courseId: req.nextUrl.searchParams.get('courseId'),
      slotKey: req.nextUrl.searchParams.get('slotKey'),
      roomId: req.nextUrl.searchParams.get('roomId') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: '현장 QR 표시 조회 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const guard = await requireDisplayTarget(req, parsed.data)
    if (guard.response) {
      return guard.response
    }

    const target = guard.target!
    const roomResolution = await resolveDisplayRoom(target.course.id, parsed.data.roomId)
    if (roomResolution.kind === 'room_required') {
      return NextResponse.json({ error: '여러 강의실이 열려 있습니다. 강의실을 선택해 주세요.' }, { status: 400 })
    }
    if (roomResolution.kind === 'not_found') {
      return NextResponse.json({ error: '강의실을 찾을 수 없습니다.' }, { status: 404 })
    }
    const room = roomResolution.room
    const session = await getActiveDisplaySessionForDisplayTarget(
      target.course.id,
      target.slot?.id ?? null,
      room.id,
    )

    return NextResponse.json({
      session: session
        ? {
          id: session.id,
          expires_at: session.expires_at,
          last_seen_at: session.last_seen_at,
          source: session.source ?? 'manual',
          display_slot_id: session.display_slot_id ?? null,
          room_id: session.room_id,
        }
        : null,
      displayUrl: buildDisplayUrlForTarget(req.nextUrl.origin, guard.division!, target, room.id),
    })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.display.GET', '현장 QR 표시 상태를 불러오지 못했습니다.', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '현장 QR 표시 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const guard = await requireDisplayTarget(req, parsed.data)
    if (guard.response) {
      return guard.response
    }

    const target = guard.target!
    const course = target.course
    const roomResolution = await resolveDisplayRoom(course.id, parsed.data.roomId)
    if (roomResolution.kind === 'room_required') {
      return NextResponse.json({ error: '여러 강의실이 열려 있습니다. 강의실을 선택해 주세요.' }, { status: 400 })
    }
    if (roomResolution.kind === 'not_found') {
      return NextResponse.json({ error: '강의실을 찾을 수 없습니다.' }, { status: 404 })
    }
    const room = roomResolution.room
    if (!room.is_open) {
      return NextResponse.json({ error: '강의실 좌석 신청을 먼저 열어 주세요.' }, { status: 409 })
    }
    if (!course.feature_designated_seat) {
      return NextResponse.json({ error: '지정좌석 기능을 먼저 활성화해야 합니다.' }, { status: 409 })
    }
    if (!course.designated_seat_open) {
      return NextResponse.json({ error: '강좌 전체 학생 신청을 먼저 열어 주세요.' }, { status: 409 })
    }

    const db = createServerClient()
    const seatCountResult = await db
      .from('course_seats')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', course.id)
      .eq('room_id', room.id)
      .eq('is_active', true)

    if ((seatCountResult.count ?? 0) === 0) {
      return NextResponse.json({ error: '먼저 좌석 레이아웃을 저장해 주세요.' }, { status: 409 })
    }

    const actor = guard.payload?.adminId ?? guard.payload?.staffName ?? 'admin'
    const nowIso = new Date().toISOString()
    let revokeQuery = db
      .from('course_seat_display_sessions')
      .update({ revoked_at: nowIso })
      .eq('course_id', course.id)
      .is('revoked_at', null)

    revokeQuery = target.mode === 'slot'
      ? revokeQuery.eq('display_slot_id', target.slot.id)
      : revokeQuery.is('display_slot_id', null)
    revokeQuery = revokeQuery.eq('room_id', room.id)

    const revokeActive = await revokeQuery
    if (revokeActive.error) {
      throw revokeActive.error
    }

    const rawToken = createOpaqueDisplayToken()
    const ttlMs = parsed.data.durationHours * 60 * 60 * 1000
    const expiresAt = new Date(Date.now() + ttlMs).toISOString()
    const insertResult = await db
      .from('course_seat_display_sessions')
      .insert({
        course_id: course.id,
        room_id: room.id,
        display_slot_id: target.slot?.id ?? null,
        display_token_hash: hashToken(rawToken),
        created_by: actor,
        expires_at: expiresAt,
        last_seen_at: nowIso,
        source: 'manual',
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
        actor,
        display_target: target.mode,
        slot_key: target.slot?.slot_key ?? null,
        room_id: room.id,
      },
    })

    return NextResponse.json({
      session: {
        id: insertResult.data.id,
        expires_at: expiresAt,
      },
      displayUrl: buildDisplayUrlForTarget(req.nextUrl.origin, guard.division!, target, room.id),
    })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.display.POST', '현장 QR 표시를 시작하지 못했습니다.', error)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '현장 QR 종료 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const guard = await requireDisplayTarget(req, parsed.data)
    if (guard.response) {
      return guard.response
    }

    const target = guard.target!
    const roomResolution = await resolveDisplayRoom(target.course.id, parsed.data.roomId)
    if (roomResolution.kind === 'room_required') {
      return NextResponse.json({ error: '여러 강의실이 열려 있습니다. 강의실을 선택해 주세요.' }, { status: 400 })
    }
    if (roomResolution.kind === 'not_found') {
      return NextResponse.json({ error: '강의실을 찾을 수 없습니다.' }, { status: 404 })
    }
    const room = roomResolution.room
    const actor = guard.payload?.adminId ?? guard.payload?.staffName ?? 'admin'
    const db = createServerClient()
    const nowIso = new Date().toISOString()
    let query = db
      .from('course_seat_display_sessions')
      .update({ revoked_at: nowIso })
      .eq('course_id', target.course.id)
      .is('revoked_at', null)

    query = target.mode === 'slot'
      ? query.eq('display_slot_id', target.slot.id)
      : query.is('display_slot_id', null)
    query = query.eq('room_id', room.id)

    const revoke = await query
    if (revoke.error) {
      throw revoke.error
    }

    await db.from('course_seat_events').insert({
      course_id: target.course.id,
      event_type: 'display_session_stopped',
      details: {
        actor,
        display_target: target.mode,
        slot_key: target.slot?.slot_key ?? null,
        room_id: room.id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.display.DELETE', '현장 QR 표시를 종료하지 못했습니다.', error)
  }
}
