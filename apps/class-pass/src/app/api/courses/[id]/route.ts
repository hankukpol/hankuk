import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { invalidateCache } from '@/lib/cache/revalidate'
import { getCourseById } from '@/lib/class-pass-data'
import {
  ATTENDANCE_FEATURE_WARNING,
  DESIGNATED_SEAT_FEATURE_WARNING,
  EXAM_DELIVERY_FEATURE_WARNING,
  containsAttendanceFeatureFields,
  hasAttendanceFeatureColumns,
  isAttendanceFeatureColumnError,
  stripAttendanceFeatureFields,
  containsDesignatedSeatFeatureFields,
  containsExamDeliveryFeatureFields,
  hasDesignatedSeatFeatureColumns,
  hasExamDeliveryFeatureColumns,
  isDesignatedSeatFeatureColumnError,
  isExamDeliveryFeatureColumnError,
  mergeFeatureWarnings,
  stripDesignatedSeatFeatureFields,
  stripExamDeliveryFeatureFields,
} from '@/lib/course-feature-compat'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt, slugifyCourseName } from '@/lib/utils'

const enrollmentFieldSchema = z.object({
  key: z.string().min(1).max(50),
  label: z.string().min(1).max(50),
  type: z.enum(['text', 'select']),
  options: z.array(z.string()).optional(),
})

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z.string().trim().max(100).optional(),
  course_type: z.enum(['interview', 'mock_exam', 'lecture', 'general']).optional(),
  status: z.enum(['active', 'archived']).optional(),
  theme_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  feature_qr_pass: z.boolean().optional(),
  feature_qr_distribution: z.boolean().optional(),
  feature_seat_assignment: z.boolean().optional(),
  feature_designated_seat: z.boolean().optional(),
  feature_attendance: z.boolean().optional(),
  feature_time_window: z.boolean().optional(),
  feature_photo: z.boolean().optional(),
  feature_dday: z.boolean().optional(),
  feature_notices: z.boolean().optional(),
  feature_refund_policy: z.boolean().optional(),
  feature_exam_delivery_mode: z.boolean().optional(),
  feature_weekday_color: z.boolean().optional(),
  feature_anti_forgery_motion: z.boolean().optional(),
  time_window_start: z.string().optional().nullable(),
  time_window_end: z.string().optional().nullable(),
  target_date: z.string().optional().nullable(),
  target_date_label: z.string().max(30).optional().nullable(),
  notice_title: z.string().max(100).optional().nullable(),
  notice_content: z.string().optional().nullable(),
  notice_visible: z.boolean().optional(),
  refund_policy: z.string().optional().nullable(),
  designated_seat_open: z.boolean().optional(),
  attendance_open: z.boolean().optional(),
  kakao_chat_url: z.string().url().optional().nullable(),
  extra_site_url: z.string().url().optional().nullable(),
  enrolled_from: z.string().optional().nullable(),
  enrolled_until: z.string().optional().nullable(),
  sort_order: z.number().int().min(0).max(999).optional(),
  enrollment_fields: z.array(enrollmentFieldSchema).optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const { id } = await params
  const courseId = parsePositiveInt(id)
  if (!courseId) {
    return NextResponse.json({ error: '잘못된 강좌 ID입니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const course = await getCourseById(courseId, division)
  if (!course) {
    return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ course })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_course_management_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const courseId = parsePositiveInt(id)
  if (!courseId) {
    return NextResponse.json({ error: '잘못된 강좌 ID입니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const existingCourse = await getCourseById(courseId, division)
  if (!existingCourse) {
    return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '강좌 수정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const nextName = parsed.data.name ?? existingCourse.name
  const featureDesignatedSeat = parsed.data.feature_designated_seat ?? existingCourse.feature_designated_seat
  const featureAttendance = parsed.data.feature_attendance ?? existingCourse.feature_attendance
  const rawUpdatePayload = {
    ...parsed.data,
    slug: parsed.data.slug === undefined
      ? existingCourse.slug
      : parsed.data.slug || slugifyCourseName(nextName),
    designated_seat_open: featureDesignatedSeat
      ? (parsed.data.designated_seat_open ?? existingCourse.designated_seat_open)
      : false,
    attendance_open: featureAttendance
      ? (parsed.data.attendance_open ?? existingCourse.attendance_open)
      : false,
    updated_at: new Date().toISOString(),
  }
  const supportsExamDeliveryFeatures = hasExamDeliveryFeatureColumns(existingCourse as unknown as Record<string, unknown>)
  const supportsDesignatedSeatFeatures = hasDesignatedSeatFeatureColumns(existingCourse as unknown as Record<string, unknown>)
  const supportsAttendanceFeatures = hasAttendanceFeatureColumns(existingCourse as unknown as Record<string, unknown>)
  const requestedExamDeliveryFeatures = containsExamDeliveryFeatureFields(parsed.data as Record<string, unknown>)
  const requestedDesignatedSeatFeatures = containsDesignatedSeatFeatureFields(parsed.data as Record<string, unknown>)
  const requestedAttendanceFeatures = containsAttendanceFeatureFields(parsed.data as Record<string, unknown>)
  let updatePayload: Record<string, unknown> = { ...rawUpdatePayload }
  const warnings: string[] = []
  let strippedExamDeliveryFeatures = false
  let strippedDesignatedSeatFeatures = false
  let strippedAttendanceFeatures = false

  if (!supportsExamDeliveryFeatures && requestedExamDeliveryFeatures) {
    updatePayload = stripExamDeliveryFeatureFields(updatePayload)
    strippedExamDeliveryFeatures = true
    warnings.push(EXAM_DELIVERY_FEATURE_WARNING)
  }

  if (!supportsDesignatedSeatFeatures && requestedDesignatedSeatFeatures) {
    updatePayload = stripDesignatedSeatFeatureFields(updatePayload)
    strippedDesignatedSeatFeatures = true
    warnings.push(DESIGNATED_SEAT_FEATURE_WARNING)
  }

  if (!supportsAttendanceFeatures && requestedAttendanceFeatures) {
    updatePayload = stripAttendanceFeatureFields(updatePayload)
    strippedAttendanceFeatures = true
    warnings.push(ATTENDANCE_FEATURE_WARNING)
  }

  const db = createServerClient()
  const runUpdate = (payload: Record<string, unknown>) => db
    .from('courses')
    .update(payload)
    .eq('id', courseId)
    .eq('division', division)
    .select('*')
    .maybeSingle()

  let { data, error } = await runUpdate(updatePayload)

  for (let attempt = 0; attempt < 3 && error; attempt += 1) {
    if (isAttendanceFeatureColumnError(error) && !strippedAttendanceFeatures) {
      updatePayload = stripAttendanceFeatureFields(updatePayload)
      strippedAttendanceFeatures = true
      warnings.push(ATTENDANCE_FEATURE_WARNING)
      const retry = await runUpdate(updatePayload)
      data = retry.data
      error = retry.error
      continue
    }

    if (isDesignatedSeatFeatureColumnError(error) && !strippedDesignatedSeatFeatures) {
      updatePayload = stripDesignatedSeatFeatureFields(updatePayload)
      strippedDesignatedSeatFeatures = true
      warnings.push(DESIGNATED_SEAT_FEATURE_WARNING)
      const retry = await runUpdate(updatePayload)
      data = retry.data
      error = retry.error
      continue
    }

    if (isExamDeliveryFeatureColumnError(error) && !strippedExamDeliveryFeatures) {
      updatePayload = stripExamDeliveryFeatureFields(updatePayload)
      strippedExamDeliveryFeatures = true
      warnings.push(EXAM_DELIVERY_FEATURE_WARNING)
      const retry = await runUpdate(updatePayload)
      data = retry.data
      error = retry.error
      continue
    }

    break
  }

  const warning = mergeFeatureWarnings(warnings)

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '같은 division 안에 동일한 강좌 slug가 이미 존재합니다.' }, { status: 409 })
    }

    return NextResponse.json({ error: '강좌를 수정하지 못했습니다.' }, { status: 500 })
  }

  await invalidateCache('courses')
  return NextResponse.json({ course: data, warning })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_course_management_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const courseId = parsePositiveInt(id)
  if (!courseId) {
    return NextResponse.json({ error: '잘못된 강좌 ID입니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const existingCourse = await getCourseById(courseId, division)
  if (!existingCourse) {
    return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('courses')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', courseId)
    .eq('division', division)
    .select('*')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: '강좌를 아카이브하지 못했습니다.' }, { status: 500 })
  }

  await invalidateCache('courses')
  return NextResponse.json({ course: data })
}
