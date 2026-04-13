import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { invalidateCache } from '@/lib/cache/revalidate'
import { getCourseById } from '@/lib/class-pass-data'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const assignSchema = z.object({
  courseId: z.number().int().positive(),
  enrollmentId: z.number().int().positive(),
  seatId: z.number().int().positive(),
})

const clearSchema = z.object({
  courseId: z.number().int().positive(),
  enrollmentId: z.number().int().positive(),
})

function getManualFailure(reason: string | undefined) {
  switch (reason) {
    case 'FEATURE_DISABLED':
      return { status: 409, message: '지정좌석 기능이 비활성화된 강좌입니다.' }
    case 'ENROLLMENT_INACTIVE':
      return { status: 409, message: '활성 수강생만 수동 배정할 수 있습니다.' }
    case 'SEAT_NOT_FOUND':
    case 'SEAT_INACTIVE':
      return { status: 404, message: '선택한 좌석을 다시 확인해주세요.' }
    case 'SEAT_TAKEN':
      return { status: 409, message: '이미 다른 학생이 사용 중인 좌석입니다.' }
    case 'NO_RESERVATION':
      return { status: 404, message: '현재 지정된 좌석이 없습니다.' }
    default:
      return { status: 500, message: '수동 좌석 처리를 완료하지 못했습니다.' }
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
    const parsed = assignSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '수동 배정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const course = await getCourseById(parsed.data.courseId, division)
    if (!course) {
      return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    const db = createServerClient()
    const rpcResult = await db.rpc('admin_assign_designated_seat', {
      p_course_id: course.id,
      p_enrollment_id: parsed.data.enrollmentId,
      p_seat_id: parsed.data.seatId,
      p_actor: payload?.adminId ?? payload?.staffName ?? 'admin',
    })

    if (rpcResult.error) {
      return NextResponse.json({ error: '수동 좌석 배정을 완료하지 못했습니다.' }, { status: 500 })
    }

    const result = rpcResult.data as { success?: boolean; reason?: string; action?: string } | null
    if (!result?.success) {
      const failure = getManualFailure(result?.reason)
      return NextResponse.json({ error: failure.message, reason: result?.reason }, { status: failure.status })
    }

    await invalidateCache('designated-seats')
    return NextResponse.json({ success: true, action: result.action ?? 'reserved' })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.manual.POST', '수동 좌석 배정을 완료하지 못했습니다.', error)
  }
}

export async function DELETE(req: NextRequest) {
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
    const parsed = clearSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '수동 해제 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const course = await getCourseById(parsed.data.courseId, division)
    if (!course) {
      return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    const db = createServerClient()
    const rpcResult = await db.rpc('admin_clear_designated_seat', {
      p_course_id: course.id,
      p_enrollment_id: parsed.data.enrollmentId,
      p_actor: payload?.adminId ?? payload?.staffName ?? 'admin',
    })

    if (rpcResult.error) {
      return NextResponse.json({ error: '수동 좌석 해제를 완료하지 못했습니다.' }, { status: 500 })
    }

    const result = rpcResult.data as { success?: boolean; reason?: string } | null
    if (!result?.success) {
      const failure = getManualFailure(result?.reason)
      return NextResponse.json({ error: failure.message, reason: result?.reason }, { status: failure.status })
    }

    await invalidateCache('designated-seats')
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.manual.DELETE', '수동 좌석 해제를 완료하지 못했습니다.', error)
  }
}
