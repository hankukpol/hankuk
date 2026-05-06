import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { getCourseById } from '@/lib/class-pass-data'
import {
  buildMultiDisplayPath,
  buildSlotDisplayPath,
  MAX_MULTI_DISPLAY_TARGETS,
  listDisplaySlotsWithCourses,
  normalizeDisplaySlotKey,
} from '@/lib/designated-seat/display-targets'
import { createServerClient } from '@/lib/supabase/server'
import { withTenantPrefix } from '@/lib/tenant'
import { getServerTenantType } from '@/lib/tenant.server'

const listSchema = z.object({
  courseId: z.coerce.number().int().positive().optional().nullable(),
})

const saveSchema = z.object({
  courseId: z.number().int().positive(),
  slotKey: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(80),
  isActive: z.boolean().optional(),
})

function getActor(payload: Awaited<ReturnType<typeof authenticateAdminRequest>>['payload']) {
  return payload?.adminId ?? payload?.staffName ?? 'admin'
}

export async function GET(req: NextRequest) {
  try {
    const { error: authError } = await authenticateAdminRequest(req)
    if (authError) {
      return authError
    }

    const featureError = await requireAppFeature('admin_seat_management_enabled')
    if (featureError) {
      return featureError
    }

    const parsed = listSchema.safeParse({
      courseId: req.nextUrl.searchParams.get('courseId'),
    })
    if (!parsed.success) {
      return NextResponse.json({ error: '표시 슬롯 조회 요청이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const slots = await listDisplaySlotsWithCourses(division)
    const origin = req.nextUrl.origin
    const activeSlotKeys = slots
      .filter((slot) => slot.is_active && slot.course_id)
      .map((slot) => slot.slot_key)

    return NextResponse.json({
      slots: slots.map((slot) => ({
        ...slot,
        displayUrl: `${origin}${withTenantPrefix(buildSlotDisplayPath(slot.slot_key), division)}`,
      })),
      currentCourseSlotKey: parsed.data.courseId
        ? slots.find((slot) => slot.course_id === parsed.data.courseId && slot.is_active)?.slot_key ?? null
        : null,
      multiDisplayUrl: activeSlotKeys.length > 0
        ? `${origin}${withTenantPrefix(buildMultiDisplayPath(activeSlotKeys.slice(0, MAX_MULTI_DISPLAY_TARGETS)), division)}`
        : '',
    })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.displaySlots.GET', '표시 슬롯 목록을 불러오지 못했습니다.', error)
  }
}

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
    const parsed = saveSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '표시 슬롯 저장 요청이 올바르지 않습니다.' }, { status: 400 })
    }

    const slotKey = normalizeDisplaySlotKey(parsed.data.slotKey)
    if (!slotKey) {
      return NextResponse.json({ error: '슬롯 키는 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const course = await getCourseById(parsed.data.courseId, division)
    if (!course) {
      return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    if (!course.feature_designated_seat) {
      return NextResponse.json({ error: '지정좌석 기능이 활성화되지 않은 강좌입니다.' }, { status: 409 })
    }

    const actor = getActor(payload)
    const db = createServerClient()
    const nowIso = new Date().toISOString()
    const existingSlotResult = await db
      .from('course_seat_display_slots')
      .select('id,course_id')
      .eq('division', division)
      .eq('slot_key', slotKey)
      .maybeSingle()

    if (existingSlotResult.error) {
      throw existingSlotResult.error
    }

    const existingSlot = existingSlotResult.data as { id: number; course_id: number | null } | null
    const { data, error } = await db
      .from('course_seat_display_slots')
      .upsert({
        division,
        slot_key: slotKey,
        label: parsed.data.label.trim(),
        course_id: course.id,
        is_active: parsed.data.isActive ?? true,
        created_by: actor,
        updated_by: actor,
        updated_at: nowIso,
      }, { onConflict: 'division,slot_key' })
      .select('*')
      .single()

    if (error) {
      throw error
    }

    if (existingSlot?.id && existingSlot.course_id !== course.id) {
      const deviceCourseSync = await db
        .from('course_seat_display_devices')
        .update({
          course_id: course.id,
          updated_at: nowIso,
        })
        .eq('slot_id', existingSlot.id)
        .is('revoked_at', null)

      if (deviceCourseSync.error) {
        throw deviceCourseSync.error
      }

      const staleCodeCleanup = await db
        .from('course_seat_display_registration_codes')
        .delete()
        .eq('slot_id', existingSlot.id)
        .is('consumed_at', null)

      if (staleCodeCleanup.error) {
        throw staleCodeCleanup.error
      }

      if (existingSlot.course_id) {
        const oldSessionRevoke = await db
          .from('course_seat_display_sessions')
          .update({ revoked_at: nowIso })
          .eq('course_id', existingSlot.course_id)
          .eq('display_slot_id', existingSlot.id)
          .is('revoked_at', null)

        if (oldSessionRevoke.error) {
          throw oldSessionRevoke.error
        }
      }
    }

    const deviceSlotMigration = await db
      .from('course_seat_display_devices')
      .update({ slot_id: data.id, updated_at: nowIso })
      .eq('course_id', course.id)
      .is('slot_id', null)
      .is('revoked_at', null)

    if (deviceSlotMigration.error) {
      throw deviceSlotMigration.error
    }

    return NextResponse.json({
      slot: data,
      displayUrl: `${req.nextUrl.origin}${withTenantPrefix(buildSlotDisplayPath(slotKey), division)}`,
    })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.displaySlots.POST', '표시 슬롯을 저장하지 못했습니다.', error)
  }
}
