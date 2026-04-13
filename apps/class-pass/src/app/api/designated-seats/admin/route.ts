import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { invalidateCache } from '@/lib/cache/revalidate'
import { getCourseById } from '@/lib/class-pass-data'
import {
  getActiveDisplaySessionForCourse,
  getDesignatedSeatAdminData,
  getTodayStartKST,
  normalizeAisleColumns,
} from '@/lib/designated-seat/service'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const searchSchema = z.object({
  courseId: z.coerce.number().int().positive(),
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
    })
    if (!parsed.success) {
      return NextResponse.json({ error: '잘못된 지정좌석 조회 요청입니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const course = await getCourseById(parsed.data.courseId, division)
    if (!course) {
      return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    const [data, activeDisplaySession] = await Promise.all([
      getDesignatedSeatAdminData(course.id),
      getActiveDisplaySessionForCourse(course.id),
    ])

    return NextResponse.json({
      course,
      ...data,
      activeDisplaySession: activeDisplaySession
        ? {
          id: activeDisplaySession.id,
          expires_at: activeDisplaySession.expires_at,
          last_seen_at: activeDisplaySession.last_seen_at,
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
      .order('position_y')
      .order('position_x')
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
      .gte('updated_at', todayStart)
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

    await db.from('course_seat_layouts').upsert({
      course_id: course.id,
      columns: parsed.data.columns,
      rows: parsed.data.rows,
      aisle_columns: normalizedAisles,
      updated_at: new Date().toISOString(),
    })

    const seatIdsToDelete = currentSeats
      .map((seat) => Number(seat.id))
      .filter((seatId) => !retainedSeatIds.has(seatId))

    if (seatIdsToDelete.length > 0) {
      await db.from('course_seats').delete().in('id', seatIdsToDelete).eq('course_id', course.id)
    }

    for (const seat of nextSeats) {
      const payload = {
        course_id: course.id,
        label: seat.label,
        position_x: seat.position_x,
        position_y: seat.position_y,
        is_active: seat.is_active,
        updated_at: new Date().toISOString(),
      }

      if (seat.id) {
        await db.from('course_seats').update(payload).eq('id', seat.id).eq('course_id', course.id)
      } else {
        await db.from('course_seats').insert(payload)
      }
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
      await db.from('courses').update(courseUpdate).eq('id', course.id).eq('division', division)
    }

    await invalidateCache('courses')
    await invalidateCache('designated-seats')

    const refreshedCourse = await getCourseById(course.id, division)
    const data = await getDesignatedSeatAdminData(course.id)

    return NextResponse.json({
      course: refreshedCourse,
      ...data,
    })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.PUT', '지정좌석 정보를 저장하지 못했습니다.', error)
  }
}
