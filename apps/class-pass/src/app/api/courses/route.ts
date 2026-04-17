import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { invalidateCache } from '@/lib/cache/revalidate'
import { listCoursesByDivision } from '@/lib/class-pass-data'
import {
  ATTENDANCE_FEATURE_WARNING,
  DESIGNATED_SEAT_FEATURE_WARNING,
  EXAM_DELIVERY_FEATURE_WARNING,
  isAttendanceFeatureColumnError,
  stripAttendanceFeatureFields,
  isDesignatedSeatFeatureColumnError,
  mergeFeatureWarnings,
  stripDesignatedSeatFeatureFields,
  isExamDeliveryFeatureColumnError,
  stripExamDeliveryFeatureFields,
} from '@/lib/course-feature-compat'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { slugifyCourseName } from '@/lib/utils'

const courseSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().trim().max(100).optional().default(''),
  course_type: z.enum(['interview', 'mock_exam', 'lecture', 'general']).default('general'),
  status: z.enum(['active', 'archived']).default('active'),
  theme_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  feature_qr_pass: z.boolean().default(true),
  feature_qr_distribution: z.boolean().default(false),
  feature_seat_assignment: z.boolean().default(false),
  feature_designated_seat: z.boolean().default(false),
  feature_attendance: z.boolean().default(false),
  feature_time_window: z.boolean().default(false),
  feature_photo: z.boolean().default(false),
  feature_dday: z.boolean().default(false),
  feature_notices: z.boolean().default(true),
  feature_refund_policy: z.boolean().default(false),
  feature_exam_delivery_mode: z.boolean().default(false),
  feature_weekday_color: z.boolean().default(false),
  feature_anti_forgery_motion: z.boolean().default(false),
  time_window_start: z.string().optional().nullable(),
  time_window_end: z.string().optional().nullable(),
  target_date: z.string().optional().nullable(),
  target_date_label: z.string().max(30).optional().nullable(),
  notice_title: z.string().max(100).optional().nullable(),
  notice_content: z.string().optional().nullable(),
  notice_visible: z.boolean().default(false),
  refund_policy: z.string().optional().nullable(),
  kakao_chat_url: z.string().url().optional().nullable(),
  extra_site_url: z.string().url().optional().nullable(),
  designated_seat_open: z.boolean().default(false),
  attendance_open: z.boolean().default(false),
  sort_order: z.number().int().min(0).max(999).default(0),
})

export async function GET(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const division = await getServerTenantType()
  const activeOnly = req.nextUrl.searchParams.get('activeOnly') === '1'
  const courses = await listCoursesByDivision(division, { activeOnly })
  return NextResponse.json({ courses })
}

export async function POST(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_course_management_enabled')
  if (featureError) {
    return featureError
  }

  const body = await req.json().catch(() => null)
  const parsed = courseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '강좌 생성 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const payload = {
    ...parsed.data,
    division,
    slug: parsed.data.slug || slugifyCourseName(parsed.data.name),
    designated_seat_open: parsed.data.feature_designated_seat ? parsed.data.designated_seat_open : false,
    attendance_open: parsed.data.feature_attendance ? parsed.data.attendance_open : false,
    updated_at: new Date().toISOString(),
  }

  const db = createServerClient()
  const runInsert = (insertPayload: Record<string, unknown>) => db
    .from('courses')
    .insert(insertPayload)
    .select('*')
    .single()

  let insertPayload: Record<string, unknown> = { ...payload }
  const warnings: string[] = []
  let strippedExamDeliveryFeatures = false
  let strippedDesignatedSeatFeatures = false
  let strippedAttendanceFeatures = false
  let { data, error } = await runInsert(insertPayload)

  for (let attempt = 0; attempt < 3 && error; attempt += 1) {
    if (isAttendanceFeatureColumnError(error) && !strippedAttendanceFeatures) {
      insertPayload = stripAttendanceFeatureFields(insertPayload)
      strippedAttendanceFeatures = true
      warnings.push(ATTENDANCE_FEATURE_WARNING)
      const retry = await runInsert(insertPayload)
      data = retry.data
      error = retry.error
      continue
    }

    if (isDesignatedSeatFeatureColumnError(error) && !strippedDesignatedSeatFeatures) {
      insertPayload = stripDesignatedSeatFeatureFields(insertPayload)
      strippedDesignatedSeatFeatures = true
      warnings.push(DESIGNATED_SEAT_FEATURE_WARNING)
      const retry = await runInsert(insertPayload)
      data = retry.data
      error = retry.error
      continue
    }

    if (isExamDeliveryFeatureColumnError(error) && !strippedExamDeliveryFeatures) {
      insertPayload = stripExamDeliveryFeatureFields(insertPayload)
      strippedExamDeliveryFeatures = true
      warnings.push(EXAM_DELIVERY_FEATURE_WARNING)
      const retry = await runInsert(insertPayload)
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

    return NextResponse.json({ error: '강좌를 생성하지 못했습니다.' }, { status: 500 })
  }

  await invalidateCache('courses')
  return NextResponse.json({ course: data, warning }, { status: 201 })
}
