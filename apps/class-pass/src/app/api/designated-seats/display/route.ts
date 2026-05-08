import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { resolveDisplayDevice } from '@/lib/designated-seat/display-device'
import { resolveDesignatedSeatDisplayTarget } from '@/lib/designated-seat/display-targets'
import {
  getRotationExpiresAt,
  shouldUpdateDisplayHeartbeat,
} from '@/lib/designated-seat/display-runtime'
import {
  ensureCourseRooms,
  ensureDisplaySessionForCurrentSchedule,
  getActiveDisplaySessionForDisplayTarget,
} from '@/lib/designated-seat/service'
import {
  generateRotationToken,
  getRotationBucket,
} from '@/lib/designated-seat/token'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import type { CourseRoom } from '@/types/database'

const schema = z.object({
  courseId: z.coerce.number().int().positive().optional().nullable(),
  slotKey: z.string().trim().min(1).max(80).optional().nullable(),
  roomId: z.coerce.number().int().positive().optional().nullable(),
}).refine((value) => Boolean(value.courseId) !== Boolean(value.slotKey), {
  message: 'Exactly one display target is required.',
})

function toSlotPayload(target: Awaited<ReturnType<typeof resolveDesignatedSeatDisplayTarget>>) {
  return target?.slot
    ? {
      id: target.slot.id,
      key: target.slot.slot_key,
      label: target.slot.label,
    }
    : null
}

function resolveDisplayRoom(rooms: CourseRoom[], requestedRoomId?: number | null) {
  if (requestedRoomId) {
    const requestedRoom = rooms.find((room) => room.id === requestedRoomId) ?? null
    return requestedRoom
      ? { kind: 'resolved' as const, room: requestedRoom }
      : { kind: 'not_found' as const }
  }

  const openRooms = rooms.filter((room) => room.is_open)
  if (openRooms.length > 0) {
    return { kind: 'resolved' as const, room: openRooms[0] }
  }

  if (rooms.length === 1) {
    return { kind: 'resolved' as const, room: rooms[0] }
  }

  return { kind: 'room_required' as const }
}

async function getActiveSeatCount(
  db: ReturnType<typeof createServerClient>,
  courseId: number,
  roomId: number,
) {
  const seatCountResult = await db
    .from('course_seats')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .eq('room_id', roomId)
    .eq('is_active', true)

  if (seatCountResult.error) {
    throw seatCountResult.error
  }

  return seatCountResult.count ?? 0
}

async function findOpenRoomWithActiveSeats(
  db: ReturnType<typeof createServerClient>,
  courseId: number,
  rooms: CourseRoom[],
  skippedRoomId?: number | null,
) {
  for (const room of rooms) {
    if (!room.is_open || room.id === skippedRoomId) {
      continue
    }

    const seatCount = await getActiveSeatCount(db, courseId, room.id)
    if (seatCount > 0) {
      return { room, seatCount }
    }
  }

  return null
}

export async function GET(req: NextRequest) {
  try {
    const parsed = schema.safeParse({
      courseId: req.nextUrl.searchParams.get('courseId'),
      slotKey: req.nextUrl.searchParams.get('slotKey'),
      roomId: req.nextUrl.searchParams.get('roomId') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: '표시 QR 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const target = await resolveDesignatedSeatDisplayTarget({
      courseId: parsed.data.courseId,
      slotKey: parsed.data.slotKey,
      division,
    })
    if (!target) {
      return NextResponse.json({ error: 'QR 표시 대상을 찾을 수 없습니다.' }, { status: 404 })
    }

    const { course } = target
    if (!course.feature_designated_seat) {
      return NextResponse.json({ error: '지정좌석 기능이 활성화되지 않은 강좌입니다.' }, { status: 409 })
    }

    const isRoomScopedDisplay = Boolean(parsed.data.roomId)
    const rooms = await ensureCourseRooms(course.id)
    const roomResolution = resolveDisplayRoom(rooms, parsed.data.roomId)
    if (roomResolution.kind === 'room_required') {
      return NextResponse.json({
        status: 'inactive',
        reason: 'ROOM_REQUIRED',
        message: '여러 강의실이 열려 있습니다. 강의실별 표시 URL을 다시 열어 주세요.',
        course: {
          id: course.id,
          name: course.name,
        },
        slot: toSlotPayload(target),
      })
    }
    if (roomResolution.kind === 'not_found') {
      return NextResponse.json({ error: '강의실을 찾을 수 없습니다.' }, { status: 404 })
    }
    let activeRoom = roomResolution.room
    const device = await resolveDisplayDevice(req, course.id, {
      slotId: target.slot?.id ?? null,
      slotKey: target.slot?.slot_key ?? null,
    })
    if (!device.ok) {
      return NextResponse.json({
        status: 'registration_required',
        code: device.reason,
        error: '등록된 QR 표시기기가 아닙니다. 관리자에게 등록 코드를 요청해 주세요.',
        course: {
          id: course.id,
          name: course.name,
        },
        slot: toSlotPayload(target),
      }, { status: device.reason === 'MISSING_COOKIE' ? 401 : 403 })
    }

    if (!course.designated_seat_open) {
      return NextResponse.json({
        status: 'inactive',
        reason: 'RESERVATION_CLOSED',
        message: '이 강좌의 좌석 신청이 닫혀 있습니다.',
        course: {
          id: course.id,
          name: course.name,
        },
        slot: toSlotPayload(target),
        room: {
          id: activeRoom.id,
          name: activeRoom.name,
        },
      })
    }

    const db = createServerClient()
    if (!isRoomScopedDisplay) {
      const existingSession = await getActiveDisplaySessionForDisplayTarget(
        course.id,
        target.slot?.id ?? null,
        null,
      )
      const sessionRoom = existingSession
        ? rooms.find((room) => room.id === existingSession.room_id) ?? null
        : null

      if (sessionRoom?.is_open) {
        activeRoom = sessionRoom
      }
    }

    if (!activeRoom.is_open) {
      return NextResponse.json({
        status: 'inactive',
        reason: 'ROOM_CLOSED',
        message: '이 강의실의 좌석 신청이 닫혀 있습니다.',
        course: {
          id: course.id,
          name: course.name,
        },
        slot: toSlotPayload(target),
        room: {
          id: activeRoom.id,
          name: activeRoom.name,
        },
      })
    }

    let activeSeatCount = await getActiveSeatCount(db, course.id, activeRoom.id)
    if (activeSeatCount === 0 && !isRoomScopedDisplay) {
      const fallback = await findOpenRoomWithActiveSeats(db, course.id, rooms, activeRoom.id)
      if (fallback) {
        activeRoom = fallback.room
        activeSeatCount = fallback.seatCount
      }
    }

    if (activeSeatCount === 0) {
      return NextResponse.json({
        status: 'inactive',
        reason: 'NO_ACTIVE_SEATS',
        message: '좌석 레이아웃이 아직 준비되지 않았습니다.',
        course: {
          id: course.id,
          name: course.name,
        },
        slot: toSlotPayload(target),
      })
    }

    const sessionAvailability = await ensureDisplaySessionForCurrentSchedule(course.id, {
      slotId: target.slot?.id ?? null,
      roomId: activeRoom.id,
    })
    if (sessionAvailability.status === 'inactive') {
      return NextResponse.json({
        status: 'inactive',
        reason: sessionAvailability.reason,
        message: '현재 입실 가능 시간이 아닙니다.',
        course: {
          id: course.id,
          name: course.name,
        },
        slot: toSlotPayload(target),
      })
    }

    const session = sessionAvailability.session
    const now = Date.now()
    const nowIso = new Date(now).toISOString()

    if (shouldUpdateDisplayHeartbeat(session.last_seen_at, now)) {
      await db
        .from('course_seat_display_sessions')
        .update({ last_seen_at: nowIso })
        .eq('id', session.id)
    }

    if (shouldUpdateDisplayHeartbeat(device.device.last_seen_at, now)) {
      await db
        .from('course_seat_display_devices')
        .update({
          last_seen_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', device.device.id)
    }

    const rotation = getRotationBucket(now)
    const rotationToken = await generateRotationToken({
      courseId: course.id,
      displaySessionId: session.id,
      roomId: isRoomScopedDisplay ? activeRoom.id : null,
      rotation,
    })
    const rotationExpiresAt = getRotationExpiresAt(rotation)

    return NextResponse.json({
      status: 'active',
      course: {
        id: course.id,
        name: course.name,
      },
      slot: toSlotPayload(target),
      room: isRoomScopedDisplay
        ? {
          id: activeRoom.id,
          name: activeRoom.name,
        }
        : null,
      session: {
        id: session.id,
        expires_at: session.expires_at,
      },
      rotationToken,
      rotationExpiresAt,
      device: {
        id: device.device.id,
        name: device.device.device_name,
      },
    })
  } catch (error) {
    return handleRouteError('designatedSeats.display.GET', '현장 QR 정보를 불러오지 못했습니다.', error)
  }
}
