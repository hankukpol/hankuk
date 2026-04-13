import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { listCourseSubjects, listSeatAssignmentsForCourse, verifyCourseOwnership } from '@/lib/class-pass-data'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

const patchSchema = z.object({
  courseId: z.number().int().positive(),
  enrollmentId: z.number().int().positive(),
  subjectId: z.number().int().positive(),
  seatNumber: z.string().trim().max(50).nullable(),
})

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) {
      return authError
    }

    const courseId = parsePositiveInt(req.nextUrl.searchParams.get('courseId'))
    if (!courseId) {
      return NextResponse.json({ error: 'courseId가 필요합니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    if (!(await verifyCourseOwnership(courseId, division))) {
      return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    const [subjects, seatAssignments] = await Promise.all([
      listCourseSubjects(courseId),
      listSeatAssignmentsForCourse(courseId),
    ])

    return NextResponse.json({ subjects, seatAssignments })
  } catch (error) {
    return handleRouteError('seats.GET', '좌석 배정 정보를 불러오지 못했습니다.', error)
  }
}

export async function PATCH(req: NextRequest) {
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
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '좌석 배정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    if (!(await verifyCourseOwnership(parsed.data.courseId, division))) {
      return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    const db = createServerClient()
    const [enrollmentResult, subjectResult] = await Promise.all([
      db
        .from('enrollments')
        .select('id')
        .eq('id', parsed.data.enrollmentId)
        .eq('course_id', parsed.data.courseId)
        .maybeSingle(),
      db
        .from('course_subjects')
        .select('id,name,sort_order')
        .eq('id', parsed.data.subjectId)
        .eq('course_id', parsed.data.courseId)
        .maybeSingle(),
    ])

    const enrollment = unwrapSupabaseResult('seats.enrollment', enrollmentResult)
    const subject = unwrapSupabaseResult('seats.subject', subjectResult)

    if (!enrollment) {
      return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (!subject) {
      return NextResponse.json({ error: '과목을 찾을 수 없습니다.' }, { status: 404 })
    }

    const nextSeatNumber = parsed.data.seatNumber?.trim() ?? ''

    if (!nextSeatNumber) {
      const { error } = await db
        .from('seat_assignments')
        .delete()
        .eq('enrollment_id', parsed.data.enrollmentId)
        .eq('subject_id', parsed.data.subjectId)

      if (error) {
        return NextResponse.json({ error: '좌석을 비우지 못했습니다.' }, { status: 500 })
      }

      await invalidateCache('seats')
      return NextResponse.json({
        success: true,
        action: 'cleared',
        subject,
      })
    }

    const { data, error } = await db
      .from('seat_assignments')
      .upsert(
        {
          enrollment_id: parsed.data.enrollmentId,
          subject_id: parsed.data.subjectId,
          seat_number: nextSeatNumber,
        },
        { onConflict: 'enrollment_id,subject_id', ignoreDuplicates: false },
      )
      .select('*')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: '좌석을 배정하지 못했습니다.' }, { status: 500 })
    }

    await invalidateCache('seats')
    return NextResponse.json({
      success: true,
      action: 'updated',
      seatAssignment: data,
      subject,
    })
  } catch (error) {
    return handleRouteError('seats.PATCH', '좌석 배정을 수정하지 못했습니다.', error)
  }
}
