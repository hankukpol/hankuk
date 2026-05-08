import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
import { getCourseById } from '@/lib/class-pass-data'
import { ensureCourseRooms } from '@/lib/designated-seat/service'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isOpen: z.boolean().optional(),
})

const patchSchema = z.object({
  roomId: z.number().int().positive(),
  name: z.string().trim().min(1).max(60).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
  isOpen: z.boolean().optional(),
})

const deleteSchema = z.object({
  roomId: z.number().int().positive(),
})

async function resolveCourse(req: NextRequest, rawId: string) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return { error: authError as NextResponse }
  }

  const featureError = await requireAppFeature('admin_seat_management_enabled')
  if (featureError) {
    return { error: featureError as NextResponse }
  }

  const courseId = parsePositiveInt(rawId)
  if (!courseId) {
    return { error: NextResponse.json({ error: '잘못된 강좌 ID입니다.' }, { status: 400 }) }
  }

  const division = await getServerTenantType()
  const course = await getCourseById(courseId, division)
  if (!course) {
    return { error: NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 }) }
  }

  return { course, division }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const resolved = await resolveCourse(req, id)
  if (resolved.error) {
    return resolved.error
  }

  return NextResponse.json({ rooms: await ensureCourseRooms(resolved.course.id) })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const resolved = await resolveCourse(req, id)
  if (resolved.error) {
    return resolved.error
  }

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '강의실 생성 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const rooms = await ensureCourseRooms(resolved.course.id)
  const db = createServerClient()
  const { data, error } = await db
    .from('course_rooms')
    .insert({
      course_id: resolved.course.id,
      name: parsed.data.name,
      sort_order: parsed.data.sortOrder ?? rooms.length,
      is_active: true,
      is_open: parsed.data.isOpen ?? false,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '같은 이름의 강의실이 이미 있습니다.' }, { status: 409 })
    }
    return NextResponse.json({ error: '강의실을 생성하지 못했습니다.' }, { status: 500 })
  }

  await invalidateCache('designated-seats')
  return NextResponse.json({ room: data, rooms: await ensureCourseRooms(resolved.course.id) }, { status: 201 })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const resolved = await resolveCourse(req, id)
  if (resolved.error) {
    return resolved.error
  }

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '강의실 수정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.name !== undefined) payload.name = parsed.data.name
  if (parsed.data.sortOrder !== undefined) payload.sort_order = parsed.data.sortOrder
  if (parsed.data.isActive !== undefined) payload.is_active = parsed.data.isActive
  if (parsed.data.isOpen !== undefined) payload.is_open = parsed.data.isOpen

  const db = createServerClient()
  const { data, error } = await db
    .from('course_rooms')
    .update(payload)
    .eq('id', parsed.data.roomId)
    .eq('course_id', resolved.course.id)
    .select('*')
    .maybeSingle()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '같은 이름의 강의실이 이미 있습니다.' }, { status: 409 })
    }
    return NextResponse.json({ error: '강의실을 수정하지 못했습니다.' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: '강의실을 찾을 수 없습니다.' }, { status: 404 })
  }

  if (parsed.data.isOpen === false || parsed.data.isActive === false) {
    const nowIso = new Date().toISOString()
    const [displayRevokeResult, authDeactivateResult] = await Promise.all([
      db
        .from('course_seat_display_sessions')
        .update({ revoked_at: nowIso })
        .eq('course_id', resolved.course.id)
        .eq('room_id', parsed.data.roomId)
        .is('revoked_at', null),
      db
        .from('course_seat_auth_sessions')
        .update({
          is_active: false,
          updated_at: nowIso,
        })
        .eq('course_id', resolved.course.id)
        .eq('room_id', parsed.data.roomId)
        .eq('is_active', true),
    ])
    if (displayRevokeResult.error || authDeactivateResult.error) {
      return NextResponse.json({ error: '강의실 상태 변경 후 세션 정리에 실패했습니다.' }, { status: 500 })
    }
  }

  await invalidateCache('designated-seats')
  return NextResponse.json({ room: data, rooms: await ensureCourseRooms(resolved.course.id) })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const resolved = await resolveCourse(req, id)
  if (resolved.error) {
    return resolved.error
  }

  const body = await req.json().catch(() => null)
  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '삭제할 강의실 ID가 필요합니다.' }, { status: 400 })
  }

  const rooms = await ensureCourseRooms(resolved.course.id)
  if (rooms.length <= 1) {
    return NextResponse.json({ error: '마지막 강의실은 삭제할 수 없습니다.' }, { status: 409 })
  }

  const db = createServerClient()
  const targetRoom = rooms.find((room) => room.id === parsed.data.roomId)
  if (!targetRoom) {
    return NextResponse.json({ error: '강의실을 찾을 수 없습니다.' }, { status: 404 })
  }
  if (targetRoom.is_open) {
    return NextResponse.json({ error: '강의실 좌석 신청을 마감한 뒤 삭제해 주세요.' }, { status: 409 })
  }

  const activeReservationCount = await db
    .from('course_seat_reservations')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', resolved.course.id)
    .eq('room_id', parsed.data.roomId)

  if (activeReservationCount.error) {
    return NextResponse.json({ error: '강의실 사용 여부를 확인하지 못했습니다.' }, { status: 500 })
  }
  if ((activeReservationCount.count ?? 0) > 0) {
    return NextResponse.json({ error: '좌석 배정 이력이 있는 강의실은 삭제할 수 없습니다.' }, { status: 409 })
  }

  const roomSeats = await db
    .from('course_seats')
    .select('id')
    .eq('course_id', resolved.course.id)
    .eq('room_id', parsed.data.roomId)

  if (roomSeats.error) {
    return NextResponse.json({ error: '강의실 좌석을 확인하지 못했습니다.' }, { status: 500 })
  }

  const roomSeatIds = (roomSeats.data ?? []).map((seat) => Number(seat.id))
  if (roomSeatIds.length > 0) {
    const eventSeatCount = await db
      .from('course_seat_events')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', resolved.course.id)
      .in('seat_id', roomSeatIds)

    if (eventSeatCount.error) {
      return NextResponse.json({ error: '강의실 사용 이력을 확인하지 못했습니다.' }, { status: 500 })
    }
    if ((eventSeatCount.count ?? 0) > 0) {
      return NextResponse.json({ error: '좌석 사용 이력이 있는 강의실은 삭제할 수 없습니다.' }, { status: 409 })
    }
  }

  const nullSeatRoomEvents = await db
    .from('course_seat_events')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', resolved.course.id)
    .is('seat_id', null)
    .contains('details', { room_id: parsed.data.roomId })

  if (nullSeatRoomEvents.error) {
    return NextResponse.json({ error: '강의실 사용 이력을 확인하지 못했습니다.' }, { status: 500 })
  }
  if ((nullSeatRoomEvents.count ?? 0) > 0) {
    return NextResponse.json({ error: '좌석 사용 이력이 있는 강의실은 삭제할 수 없습니다.' }, { status: 409 })
  }

  const { data, error } = await db
    .from('course_rooms')
    .delete()
    .eq('id', parsed.data.roomId)
    .eq('course_id', resolved.course.id)
    .select('id')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: '강의실을 삭제하지 못했습니다.' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: '강의실을 찾을 수 없습니다.' }, { status: 404 })
  }

  await invalidateCache('designated-seats')
  return NextResponse.json({ success: true, rooms: await ensureCourseRooms(resolved.course.id) })
}
