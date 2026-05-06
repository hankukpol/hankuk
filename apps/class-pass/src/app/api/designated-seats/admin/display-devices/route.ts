import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import {
  DISPLAY_DEVICE_REGISTRATION_CODE_TTL_MS,
  generateDisplayRegistrationCode,
  hashDisplayRegistrationCode,
  hashDisplaySlotRegistrationCode,
} from '@/lib/designated-seat/display-device'
import { resolveDesignatedSeatDisplayTarget } from '@/lib/designated-seat/display-targets'
import { logDesignatedSeatEvent } from '@/lib/designated-seat/service'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const targetSchema = z.object({
  courseId: z.coerce.number().int().positive().optional().nullable(),
  slotKey: z.string().trim().min(1).max(80).optional().nullable(),
}).refine((value) => Boolean(value.courseId) !== Boolean(value.slotKey), {
  message: 'Exactly one display target is required.',
})

const createSchema = z.object({
  courseId: z.number().int().positive().optional().nullable(),
  slotKey: z.string().trim().min(1).max(80).optional().nullable(),
  deviceName: z.string().trim().min(1).max(80),
}).refine((value) => Boolean(value.courseId) !== Boolean(value.slotKey), {
  message: 'Exactly one display target is required.',
})

const deleteSchema = z.object({
  courseId: z.number().int().positive().optional().nullable(),
  slotKey: z.string().trim().min(1).max(80).optional().nullable(),
  deviceId: z.number().int().positive(),
}).refine((value) => Boolean(value.courseId) !== Boolean(value.slotKey), {
  message: 'Exactly one display target is required.',
})

function getActor(payload: Awaited<ReturnType<typeof authenticateAdminRequest>>['payload']) {
  return payload?.adminId ?? payload?.staffName ?? 'admin'
}

function isUniqueViolation(error: { code?: string } | null | undefined) {
  return error?.code === '23505'
}

async function requireDisplayTarget(req: NextRequest, input: { courseId?: number | null; slotKey?: string | null }) {
  const { error: authError, payload } = await authenticateAdminRequest(req)
  if (authError) {
    return { response: authError, target: null, actor: null }
  }

  const featureError = await requireAppFeature('admin_seat_management_enabled')
  if (featureError) {
    return { response: featureError, target: null, actor: null }
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
      actor: null,
    }
  }

  return { response: null, target, actor: getActor(payload) }
}

export async function GET(req: NextRequest) {
  try {
    const parsed = targetSchema.safeParse({
      courseId: req.nextUrl.searchParams.get('courseId'),
      slotKey: req.nextUrl.searchParams.get('slotKey'),
    })
    if (!parsed.success) {
      return NextResponse.json({ error: '표시기기 조회 요청이 올바르지 않습니다.' }, { status: 400 })
    }

    const guard = await requireDisplayTarget(req, parsed.data)
    if (guard.response) {
      return guard.response
    }

    const db = createServerClient()
    let query = db
      .from('course_seat_display_devices')
      .select('id,course_id,slot_id,device_name,registered_by,last_seen_at,created_at,updated_at')
      .is('revoked_at', null)
      .order('created_at', { ascending: true })

    query = guard.target!.mode === 'slot'
      ? query.eq('slot_id', guard.target!.slot.id)
      : query.eq('course_id', guard.target!.course.id).is('slot_id', null)

    const { data, error } = await query
    if (error) {
      throw error
    }

    return NextResponse.json({ devices: data ?? [] })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.displayDevices.GET', '표시기기 목록을 불러오지 못했습니다.', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '등록 코드 생성 요청이 올바르지 않습니다.' }, { status: 400 })
    }

    const guard = await requireDisplayTarget(req, parsed.data)
    if (guard.response) {
      return guard.response
    }

    const target = guard.target!
    const nowIso = new Date().toISOString()
    const expiresAt = new Date(Date.now() + DISPLAY_DEVICE_REGISTRATION_CODE_TTL_MS).toISOString()
    const db = createServerClient()

    let cleanupQuery = db
      .from('course_seat_display_registration_codes')
      .delete()
      .is('consumed_at', null)
      .lte('expires_at', nowIso)

    cleanupQuery = target.mode === 'slot'
      ? cleanupQuery.eq('slot_id', target.slot.id)
      : cleanupQuery.eq('course_id', target.course.id).is('slot_id', null)

    const cleanup = await cleanupQuery
    if (cleanup.error) {
      throw cleanup.error
    }

    let code = ''
    let created = false
    for (let attempt = 0; attempt < 5; attempt += 1) {
      code = generateDisplayRegistrationCode()
      const { error } = await db
        .from('course_seat_display_registration_codes')
        .insert({
          course_id: target.course.id,
          slot_id: target.slot?.id ?? null,
          code_hash: target.mode === 'slot'
            ? hashDisplaySlotRegistrationCode(target.slot.id, code)
            : hashDisplayRegistrationCode(target.course.id, code),
          device_name: parsed.data.deviceName.trim(),
          created_by: guard.actor,
          expires_at: expiresAt,
        })

      if (!error) {
        created = true
        break
      }

      if (!isUniqueViolation(error)) {
        throw error
      }
    }

    if (!created) {
      return NextResponse.json({ error: '등록 코드 생성이 일시적으로 충돌했습니다. 다시 시도해 주세요.' }, { status: 409 })
    }

    return NextResponse.json({
      code,
      expiresAt,
      deviceName: parsed.data.deviceName.trim(),
      target: target.mode,
      slotKey: target.slot?.slot_key ?? null,
    })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.displayDevices.POST', '표시기기 등록 코드를 만들지 못했습니다.', error)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = deleteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '표시기기 해제 요청이 올바르지 않습니다.' }, { status: 400 })
    }

    const guard = await requireDisplayTarget(req, parsed.data)
    if (guard.response) {
      return guard.response
    }

    const nowIso = new Date().toISOString()
    const db = createServerClient()
    let query = db
      .from('course_seat_display_devices')
      .update({
        revoked_at: nowIso,
        revoked_by: guard.actor,
        updated_at: nowIso,
      })
      .eq('id', parsed.data.deviceId)
      .is('revoked_at', null)

    query = guard.target!.mode === 'slot'
      ? query.eq('slot_id', guard.target!.slot.id)
      : query.eq('course_id', guard.target!.course.id).is('slot_id', null)

    const { data, error } = await query
      .select('id,device_name')
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!data) {
      return NextResponse.json({ error: '등록된 표시기기를 찾을 수 없습니다.' }, { status: 404 })
    }

    await logDesignatedSeatEvent({
      course_id: guard.target!.course.id,
      enrollment_id: null,
      seat_id: null,
      event_type: 'display_device_revoked',
      details: {
        device_id: data.id,
        device_name: data.device_name,
        actor: guard.actor,
        display_target: guard.target!.mode,
        slot_key: guard.target!.slot?.slot_key ?? null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.displayDevices.DELETE', '표시기기 해제를 처리하지 못했습니다.', error)
  }
}
