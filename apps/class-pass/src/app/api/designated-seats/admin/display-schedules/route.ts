import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { getCourseById } from '@/lib/class-pass-data'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)

const listSchema = z.object({
  courseId: z.coerce.number().int().positive(),
})

const scheduleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema,
  label: z.string().trim().max(80).optional().nullable(),
  isActive: z.boolean(),
})

const saveSchema = z.object({
  courseId: z.number().int().positive(),
  schedules: z.array(scheduleSchema).max(28),
})

function normalizeTime(value: string) {
  return `${value}:00`
}

function assertValidScheduleTimes(schedules: z.infer<typeof scheduleSchema>[]) {
  for (const schedule of schedules) {
    if (schedule.startTime >= schedule.endTime) {
      return false
    }
  }

  return true
}

async function requireCourse(req: NextRequest, courseId: number) {
  const { error: authError } = await authenticateAdminRequest(req)
  if (authError) {
    return { response: authError, course: null }
  }

  const featureError = await requireAppFeature('admin_seat_management_enabled')
  if (featureError) {
    return { response: featureError, course: null }
  }

  const division = await getServerTenantType()
  const course = await getCourseById(courseId, division)
  if (!course) {
    return {
      response: NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 }),
      course: null,
    }
  }

  return { response: null, course }
}

export async function GET(req: NextRequest) {
  try {
    const parsed = listSchema.safeParse({
      courseId: req.nextUrl.searchParams.get('courseId'),
    })
    if (!parsed.success) {
      return NextResponse.json({ error: '표시 스케줄 조회 요청이 올바르지 않습니다.' }, { status: 400 })
    }

    const guard = await requireCourse(req, parsed.data.courseId)
    if (guard.response) {
      return guard.response
    }

    const db = createServerClient()
    const { data, error } = await db
      .from('course_seat_display_schedules')
      .select('*')
      .eq('course_id', guard.course!.id)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true })

    if (error) {
      throw error
    }

    return NextResponse.json({ schedules: data ?? [] })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.displaySchedules.GET', '표시 스케줄을 불러오지 못했습니다.', error)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = saveSchema.safeParse(body)
    if (!parsed.success || !assertValidScheduleTimes(parsed.data.schedules)) {
      return NextResponse.json({ error: '표시 스케줄 저장 요청이 올바르지 않습니다.' }, { status: 400 })
    }

    const guard = await requireCourse(req, parsed.data.courseId)
    if (guard.response) {
      return guard.response
    }

    const db = createServerClient()
    const payload = parsed.data.schedules.map((schedule) => ({
      day_of_week: schedule.dayOfWeek,
      start_time: normalizeTime(schedule.startTime),
      end_time: normalizeTime(schedule.endTime),
      label: schedule.label?.trim() || null,
      is_active: schedule.isActive,
    }))

    const replaceResult = await db.rpc('replace_course_seat_display_schedules', {
      p_course_id: guard.course!.id,
      p_schedules: payload,
    })

    if (replaceResult.error) {
      throw replaceResult.error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.displaySchedules.PUT', '표시 스케줄을 저장하지 못했습니다.', error)
  }
}
