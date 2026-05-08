import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { invalidateCache } from '@/lib/cache/revalidate'
import { getCourseById } from '@/lib/class-pass-data'
import {
  getActiveDisplaySessionForDisplayTarget,
  getDesignatedSeatAdminData,
  getTodayStartKST,
  ensureCourseRooms,
  listDesignatedSeatReservationsForDate,
  normalizeAisleColumns,
  resolveActiveRoomId,
} from '@/lib/designated-seat/service'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

function writeError(message: string, error?: { code?: string; message?: string } | null) {
  console.error('designatedSeats.admin.PUT', { message, error })
  return NextResponse.json({ error: message }, { status: 500 })
}

const searchSchema = z.object({
  courseId: z.coerce.number().int().positive(),
  roomId: z.coerce.number().int().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

const seatSchema = z.object({
  id: z.number().int().positive().optional(),
  label: z.string().trim().min(1).max(20),
  position_x: z.number().int().min(1).max(30),
  position_y: z.number().int().min(1).max(30),
  is_active: z.boolean(),
})

const layoutSchema = z.object({
  courseId: z.number().int().positive(),
  roomId: z.number().int().positive(),
  columns: z.number().int().min(1).max(30),
  rows: z.number().int().min(1).max(30),
  aisleColumns: z.array(z.number().int().min(1).max(30)).default([]),
  seats: z.array(seatSchema),
  featureDesignatedSeat: z.boolean().optional(),
  designatedSeatOpen: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) {
      return authError
    }

    const featureError = await requireAppFeature('admin_seat_management_enabled')
    if (featureError) {
      return featureError
    }

    const parsed = searchSchema.safeParse({
      courseId: req.nextUrl.searchParams.get('courseId'),
      roomId: req.nextUrl.searchParams.get('roomId') ?? undefined,
      date: req.nextUrl.searchParams.get('date') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: '잘못된 지정좌석 조회 요청입니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const course = await getCourseById(parsed.data.courseId, division)
    if (!course) {
      return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    const rooms = await ensureCourseRooms(course.id)
    const activeRoomId = resolveActiveRoomId(rooms, parsed.data.roomId)
    if (!activeRoomId || (parsed.data.roomId && activeRoomId !== parsed.data.roomId)) {
      return NextResponse.json({ error: '강의실을 찾을 수 없습니다.' }, { status: 404 })
    }

    const [data, activeDisplaySession] = await Promise.all([
      getDesignatedSeatAdminData(course.id, activeRoomId),
      getActiveDisplaySessionForDisplayTarget(course.id, null, activeRoomId),
    ])
    const reservations = parsed.data.date
      ? await listDesignatedSeatReservationsForDate(course.id, activeRoomId, parsed.data.date)
      : data.reservations

    return NextResponse.json({
      course,
      rooms,
      activeRoomId,
      ...data,
      reservations,
      activeDisplaySession: activeDisplaySession
        ? {
          id: activeDisplaySession.id,
          expires_at: activeDisplaySession.expires_at,
          last_seen_at: activeDisplaySession.last_seen_at,
          source: activeDisplaySession.source ?? 'manual',
          display_slot_id: activeDisplaySession.display_slot_id ?? null,
          room_id: activeDisplaySession.room_id,
        }
        : null,
    })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.GET', '지정좌석 정보를 불러오지 못했습니다.', error)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) {
      return authError
    }

    const featureError = await requireAppFeature('admin_seat_management_enabled')
    if (featureError) {
      return featureError
    }

    const body = await req.json().catch(() => null)
    const parsed = layoutSchema.safeParse(body)
    if (!parsed.success) {
      const issues = parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      return NextResponse.json({ error: `지정좌석 저장 형식이 올바르지 않습니다. (${issues.join('; ')})` }, { status: 400 })
    }

    const division = await getServerTenantType()
    const course = await getCourseById(parsed.data.courseId, division)
    if (!course) {
      return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
    }
    const rooms = await ensureCourseRooms(course.id)
    const activeRoomId = resolveActiveRoomId(rooms, parsed.data.roomId)
    if (!activeRoomId || activeRoomId !== parsed.data.roomId) {
      return NextResponse.json({ error: '강의실을 찾을 수 없습니다.' }, { status: 404 })
    }

    const normalizedAisles = normalizeAisleColumns(parsed.data.aisleColumns).filter(
      (value) => value < parsed.data.columns,
    )
    const nextSeats = parsed.data.seats.map((seat) => ({
      ...seat,
      label: seat.label.trim(),
    }))

    const labelSet = new Set<string>()
    const positionSet = new Set<string>()
    for (const seat of nextSeats) {
      if (seat.position_x > parsed.data.columns || seat.position_y > parsed.data.rows) {
        return NextResponse.json({ error: '좌석 위치가 현재 행/열 범위를 벗어났습니다.' }, { status: 400 })
      }

      const labelKey = seat.label.toUpperCase()
      if (labelSet.has(labelKey)) {
        return NextResponse.json({ error: `좌석 라벨 "${seat.label}"가 중복되었습니다.` }, { status: 409 })
      }
      labelSet.add(labelKey)

      const positionKey = `${seat.position_x}:${seat.position_y}`
      if (positionSet.has(positionKey)) {
        return NextResponse.json({ error: '좌석 위치가 중복되었습니다.' }, { status: 409 })
      }
      positionSet.add(positionKey)
    }

    const db = createServerClient()
    const currentSeatsResult = await db
      .from('course_seats')
      .select('id,label')
      .eq('course_id', course.id)
      .eq('room_id', activeRoomId)
      .order('position_y')
      .order('position_x')
    if (currentSeatsResult.error) {
      return writeError('현재 좌석 정보를 불러오지 못했습니다.', currentSeatsResult.error)
    }
    const currentSeats = currentSeatsResult.data ?? []
    const currentSeatIds = new Set(currentSeats.map((seat) => Number(seat.id)))
    const retainedSeatIds = new Set(nextSeats.filter((seat) => seat.id).map((seat) => Number(seat.id)))

    for (const seat of nextSeats) {
      if (seat.id && !currentSeatIds.has(seat.id)) {
        return NextResponse.json({ error: '다른 강좌 좌석은 수정할 수 없습니다.' }, { status: 400 })
      }
    }

    const todayStart = getTodayStartKST()
    const reservationsResult = await db
      .from('course_seat_reservations')
      .select('seat_id')
      .eq('course_id', course.id)
      .eq('room_id', activeRoomId)
      .gte('updated_at', todayStart)
    if (reservationsResult.error) {
      return writeError('현재 좌석 예약 정보를 불러오지 못했습니다.', reservationsResult.error)
    }
    const reservedSeatIds = new Set((reservationsResult.data ?? []).map((row) => Number(row.seat_id)))

    const deactivatedReserved = nextSeats
      .filter((seat) => seat.id && reservedSeatIds.has(seat.id) && !seat.is_active)
      .map((seat) => seat.label)
    if (deactivatedReserved.length > 0) {
      return NextResponse.json({
        error: `현재 배정 중인 좌석은 비활성화할 수 없습니다: ${deactivatedReserved.join(', ')}`,
      }, { status: 409 })
    }

    const deletedReserved = currentSeats
      .filter((seat) => !retainedSeatIds.has(Number(seat.id)) && reservedSeatIds.has(Number(seat.id)))
      .map((seat) => String(seat.label))
    if (deletedReserved.length > 0) {
      return NextResponse.json({
        error: `현재 배정 중인 좌석은 삭제할 수 없습니다: ${deletedReserved.join(', ')}`,
      }, { status: 409 })
    }

    const seatIdsToDelete = currentSeats
      .map((seat) => Number(seat.id))
      .filter((seatId) => !retainedSeatIds.has(seatId))

    if (seatIdsToDelete.length > 0) {
      const eventHistoryResult = await db
        .from('course_seat_events')
        .select('id', { count: 'exact', head: true })
        .eq('course_id', course.id)
        .in('seat_id', seatIdsToDelete)
      if (eventHistoryResult.error) {
        return writeError('좌석 이력을 확인하지 못했습니다.', eventHistoryResult.error)
      }
      if ((eventHistoryResult.count ?? 0) > 0) {
        return NextResponse.json({
          error: '배정 이력이 있는 좌석은 삭제할 수 없습니다. 운영 대상에서 제외하려면 좌석을 비활성화해 주세요.',
        }, { status: 409 })
      }
    }

    const layoutSaveResult = await db.rpc('save_course_room_seat_layout', {
      p_course_id: course.id,
      p_room_id: activeRoomId,
      p_columns: parsed.data.columns,
      p_rows: parsed.data.rows,
      p_aisle_columns: normalizedAisles,
      p_seats: nextSeats.map((seat) => ({
        id: seat.id ?? null,
        label: seat.label,
        position_x: seat.position_x,
        position_y: seat.position_y,
        is_active: seat.is_active,
      })),
    })
    if (layoutSaveResult.error) {
      return writeError('좌석 레이아웃을 저장하지 못했습니다.', layoutSaveResult.error)
    }

    const courseUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (parsed.data.featureDesignatedSeat !== undefined) {
      courseUpdate.feature_designated_seat = parsed.data.featureDesignatedSeat
    }
    if (parsed.data.designatedSeatOpen !== undefined) {
      courseUpdate.designated_seat_open = parsed.data.featureDesignatedSeat === false
        ? false
        : parsed.data.designatedSeatOpen
    }

    if (Object.keys(courseUpdate).length > 1) {
      const courseUpdateResult = await db.from('courses').update(courseUpdate).eq('id', course.id).eq('division', division)
      if (courseUpdateResult.error) {
        return writeError('강좌 지정좌석 설정을 저장하지 못했습니다.', courseUpdateResult.error)
      }
    }

    await invalidateCache('courses')
    await invalidateCache('designated-seats')

    const refreshedCourse = await getCourseById(course.id, division)
    const data = await getDesignatedSeatAdminData(course.id, activeRoomId)

    return NextResponse.json({
      course: refreshedCourse,
      rooms,
      activeRoomId,
      ...data,
    })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.PUT', '지정좌석 정보를 저장하지 못했습니다.', error)
  }
}
