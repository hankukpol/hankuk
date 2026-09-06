import { NextRequest, NextResponse } from 'next/server'
import { requireStudentSession } from '@/lib/auth/student-session'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { verifyStudentSeatAccess } from '@/lib/designated-seat/service'
import { normalizeDesignatedSeatScanIssueOccurredAt } from '@/lib/designated-seat/scan-issues-query'
import { DESIGNATED_SEAT_SCAN_ISSUE_EVENT_TYPES } from '@/lib/designated-seat/scan-telemetry'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const cameraSettingsSchema = z.object({
  width: z.number().int().positive().max(10_000).optional(),
  height: z.number().int().positive().max(10_000).optional(),
  frameRate: z.number().positive().max(240).optional(),
  aspectRatio: z.number().positive().max(10).optional(),
  zoom: z.number().positive().max(100).optional(),
  focusMode: z.string().trim().max(50).optional(),
  focusDistance: z.number().min(0).max(1_000).optional(),
}).strict()

const deviceSignatureSchema = z.object({
  platform: z.string().max(100).optional(),
  language: z.string().max(50).optional(),
  screen: z.string().max(50).optional(),
  timezone: z.string().max(100).optional(),
}).strict()

const schema = z.object({
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime({ offset: true }),
  courseId: z.number().int().positive(),
  enrollmentId: z.number().int().positive(),
  roomId: z.number().int().positive().optional().nullable(),
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(10).max(30),
  eventType: z.enum(DESIGNATED_SEAT_SCAN_ISSUE_EVENT_TYPES),
  reason: z.string().trim().min(1).max(80),
  durationMs: z.number().int().min(0).max(30 * 60 * 1000).optional(),
  cameraLabel: z.string().trim().max(160).optional(),
  cameraSettings: cameraSettingsSchema.optional(),
  responseStatus: z.number().int().min(0).max(599).optional(),
  responseCode: z.string().trim().max(100).optional(),
  responseMessage: z.string().trim().max(300).optional(),
  deviceSignature: deviceSignatureSchema.optional(),
})

const EVENT_DEDUPE_WINDOW_MS = 30_000

export async function POST(req: NextRequest) {
  try {
    const studentSession = await requireStudentSession(req)
    if (studentSession instanceof NextResponse) return studentSession

    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'QR 문제 기록 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const now = Date.now()
    const occurredAtResult = normalizeDesignatedSeatScanIssueOccurredAt(parsed.data.occurredAt, now)

    const division = await getServerTenantType()
    const access = await verifyStudentSeatAccess({
      courseId: parsed.data.courseId,
      enrollmentId: parsed.data.enrollmentId,
      studentId: studentSession.studentId,
      name: parsed.data.name,
      phone: parsed.data.phone,
      division,
    })
    if (!access) {
      return NextResponse.json({ error: '학생 정보를 확인하지 못했습니다.' }, { status: 404 })
    }

    const db = createServerClient()
    const exactDuplicate = await db
      .from('course_seat_events')
      .select('id')
      .eq('course_id', access.course.id)
      .eq('enrollment_id', access.enrollment.id)
      .contains('details', { client_event_id: parsed.data.eventId })
      .limit(1)

    if (exactDuplicate.error) {
      throw exactDuplicate.error
    }
    if ((exactDuplicate.data ?? []).length > 0) {
      return NextResponse.json({ recorded: false, reason: 'idempotent_replay' })
    }

    const dedupeSince = new Date(now - EVENT_DEDUPE_WINDOW_MS).toISOString()
    const recentEquivalent = await db
      .from('course_seat_events')
      .select('id')
      .eq('course_id', access.course.id)
      .eq('enrollment_id', access.enrollment.id)
      .eq('event_type', parsed.data.eventType)
      .contains('details', { reason: parsed.data.reason })
      .gte('created_at', dedupeSince)
      .limit(1)

    if (recentEquivalent.error) {
      throw recentEquivalent.error
    }
    if ((recentEquivalent.data ?? []).length > 0) {
      return NextResponse.json({ recorded: false, reason: 'rate_limited' })
    }

    const insertResult = await db.from('course_seat_events').insert({
      course_id: access.course.id,
      enrollment_id: access.enrollment.id,
      seat_id: null,
      event_type: parsed.data.eventType,
      details: {
        source: 'student_web_scanner',
        client_event_id: parsed.data.eventId,
        occurred_at: occurredAtResult.occurredAt,
        client_occurred_at: parsed.data.occurredAt,
        client_clock_adjusted: occurredAtResult.adjusted,
        reason: parsed.data.reason,
        room_id: parsed.data.roomId ?? null,
        duration_ms: parsed.data.durationMs ?? null,
        camera_label: parsed.data.cameraLabel ?? null,
        camera_settings: parsed.data.cameraSettings ?? null,
        response_status: parsed.data.responseStatus ?? null,
        response_code: parsed.data.responseCode ?? null,
        response_message: parsed.data.responseMessage ?? null,
        device_signature: parsed.data.deviceSignature ?? {},
        user_agent: req.headers.get('user-agent'),
      },
    })
    if (insertResult.error) {
      throw insertResult.error
    }

    return NextResponse.json({ recorded: true })
  } catch (error) {
    return handleRouteError('designatedSeats.scanEvents.POST', 'QR 문제 기록을 저장하지 못했습니다.', error)
  }
}
