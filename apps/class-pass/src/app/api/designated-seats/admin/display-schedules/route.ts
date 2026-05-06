import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { resolveDesignatedSeatDisplayTarget } from '@/lib/designated-seat/display-targets'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)

const targetSchema = z.object({
  courseId: z.coerce.number().int().positive().optional().nullable(),
  slotKey: z.string().trim().min(1).max(80).optional().nullable(),
}).refine((value) => Boolean(value.courseId) !== Boolean(value.slotKey), {
  message: 'Exactly one display target is required.',
})

const scheduleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema,
  label: z.string().trim().max(80).optional().nullable(),
  isActive: z.boolean(),
})

const saveSchema = z.object({
  courseId: z.number().int().positive().optional().nullable(),
  slotKey: z.string().trim().min(1).max(80).optional().nullable(),
  schedules: z.array(scheduleSchema).max(28),
}).refine((value) => Boolean(value.courseId) !== Boolean(value.slotKey), {
  message: 'Exactly one display target is required.',
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

async function requireDisplayTarget(req: NextRequest, input: { courseId?: number | null; slotKey?: string | null }) {
  const { error: authError } = await authenticateAdminRequest(req)
  if (authError) {
    return { response: authError, target: null }
  }

  const featureError = await requireAppFeature('admin_seat_management_enabled')
  if (featureError) {
    return { response: featureError, target: null }
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
    }
  }

  return { response: null, target }
}

export async function GET(req: NextRequest) {
  try {
    const parsed = targetSchema.safeParse({
      courseId: req.nextUrl.searchParams.get('courseId'),
      slotKey: req.nextUrl.searchParams.get('slotKey'),
    })
    if (!parsed.success) {
      return NextResponse.json({ error: '표시 스케줄 조회 요청이 올바르지 않습니다.' }, { status: 400 })
    }

    const guard = await requireDisplayTarget(req, parsed.data)
    if (guard.response) {
      return guard.response
    }

    const db = createServerClient()
    const query = guard.target!.mode === 'slot'
      ? db
        .from('course_seat_display_slot_schedules')
        .select('*')
        .eq('slot_id', guard.target!.slot.id)
      : db
        .from('course_seat_display_schedules')
        .select('*')
        .eq('course_id', guard.target!.course.id)

    const { data, error } = await query
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

    const guard = await requireDisplayTarget(req, parsed.data)
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

    const replaceResult = guard.target!.mode === 'slot'
      ? await db.rpc('replace_course_seat_display_slot_schedules', {
        p_slot_id: guard.target!.slot.id,
        p_schedules: payload,
      })
      : await db.rpc('replace_course_seat_display_schedules', {
        p_course_id: guard.target!.course.id,
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
