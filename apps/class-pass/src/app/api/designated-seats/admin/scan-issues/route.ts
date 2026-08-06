import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { getCourseById } from '@/lib/class-pass-data'
import {
  DESIGNATED_SEAT_SCAN_ISSUE_EVENT_TYPES,
  isDesignatedSeatScanIssueEventType,
} from '@/lib/designated-seat/scan-telemetry'
import {
  buildDesignatedSeatScanIssueResolutionMap,
  DESIGNATED_SEAT_SCAN_RESOLUTION_EVENT_TYPES,
  DESIGNATED_SEAT_SCAN_ISSUES_PAGE_SIZE,
  getKstDateBounds,
  isValidKstDateKey,
} from '@/lib/designated-seat/scan-issues-query'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

type CourseSeatEventRow = {
  id: number
  enrollment_id: number | null
  event_type: string
  details: unknown
  created_at: string
}

function getIssueOccurredAt(event: CourseSeatEventRow) {
  if (event.details && typeof event.details === 'object' && !Array.isArray(event.details)) {
    const occurredAt = (event.details as Record<string, unknown>).occurred_at
    if (typeof occurredAt === 'string' && Number.isFinite(Date.parse(occurredAt))) {
      return occurredAt
    }
  }
  return event.created_at
}

async function loadCourseSeatEvents(params: {
  db: ReturnType<typeof createServerClient>
  courseId: number
  eventTypes: readonly string[]
  startIso: string
  endIso: string
}) {
  const rows: CourseSeatEventRow[] = []
  const pageSize = 1_000

  for (let offset = 0; ; offset += pageSize) {
    const result = await params.db
      .from('course_seat_events')
      .select('id,enrollment_id,event_type,details,created_at')
      .eq('course_id', params.courseId)
      .in('event_type', [...params.eventTypes])
      .gte('created_at', params.startIso)
      .lt('created_at', params.endIso)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (result.error) throw result.error
    const page = (result.data ?? []) as CourseSeatEventRow[]
    rows.push(...page)
    if (page.length < pageSize) break
  }

  return rows
}

const schema = z.object({
  courseId: z.coerce.number().int().positive(),
  date: z.string().refine(isValidKstDateKey),
  cursorCreatedAt: z.string().datetime({ offset: true }).optional(),
  cursorId: z.coerce.number().int().positive().optional(),
}).refine(
  (value) => Boolean(value.cursorCreatedAt) === Boolean(value.cursorId),
  { message: 'Cursor fields must be provided together.' },
)

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const featureError = await requireAppFeature('admin_seat_management_enabled')
    if (featureError) return featureError

    const parsed = schema.safeParse({
      courseId: req.nextUrl.searchParams.get('courseId'),
      date: req.nextUrl.searchParams.get('date'),
      cursorCreatedAt: req.nextUrl.searchParams.get('cursorCreatedAt') ?? undefined,
      cursorId: req.nextUrl.searchParams.get('cursorId') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json({ error: 'QR 문제 조회 요청이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const course = await getCourseById(parsed.data.courseId, division)
    if (!course) {
      return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    const { startIso, endIso } = getKstDateBounds(parsed.data.date)
    const db = createServerClient()
    const resolutionEndIso = new Date(Date.parse(endIso) + 5 * 60 * 1000).toISOString()
    const [allIssueEvents, resolutionEvents] = await Promise.all([
      loadCourseSeatEvents({
        db,
        courseId: course.id,
        eventTypes: DESIGNATED_SEAT_SCAN_ISSUE_EVENT_TYPES,
        startIso,
        endIso,
      }),
      loadCourseSeatEvents({
        db,
        courseId: course.id,
        eventTypes: DESIGNATED_SEAT_SCAN_RESOLUTION_EVENT_TYPES,
        startIso,
        endIso: resolutionEndIso,
      }),
    ])

    const resolutionMap = buildDesignatedSeatScanIssueResolutionMap(
      allIssueEvents.map((event) => ({
        id: Number(event.id),
        enrollmentId: event.enrollment_id ? Number(event.enrollment_id) : null,
        // 실패 기록이 재시도 성공 뒤에 지연 전송돼도 실제 발생 순서대로 해결 상태를 판정합니다.
        recordedAt: getIssueOccurredAt(event),
      })),
      resolutionEvents.map((event) => ({
        id: Number(event.id),
        enrollmentId: event.enrollment_id ? Number(event.enrollment_id) : null,
        eventType: event.event_type as (typeof DESIGNATED_SEAT_SCAN_RESOLUTION_EVENT_TYPES)[number],
        recordedAt: event.created_at,
      })),
    )
    const cursorTime = parsed.data.cursorCreatedAt ? Date.parse(parsed.data.cursorCreatedAt) : null
    const pageCandidates = cursorTime !== null && parsed.data.cursorId
      ? allIssueEvents.filter((event) => {
        const eventTime = Date.parse(event.created_at)
        return eventTime < cursorTime || (eventTime === cursorTime && Number(event.id) < parsed.data.cursorId!)
      })
      : allIssueEvents
    const fetchedEvents = pageCandidates
      .slice(0, DESIGNATED_SEAT_SCAN_ISSUES_PAGE_SIZE + 1)
      .filter(
        (event) => isDesignatedSeatScanIssueEventType(event.event_type),
      )
    const hasMore = fetchedEvents.length > DESIGNATED_SEAT_SCAN_ISSUES_PAGE_SIZE
    const events = fetchedEvents.slice(0, DESIGNATED_SEAT_SCAN_ISSUES_PAGE_SIZE)
    const enrollmentIds = [...new Set(
      events
        .map((event) => event.enrollment_id)
        .filter((id): id is number => typeof id === 'number')
        .map(Number),
    )]
    const enrollmentResult = enrollmentIds.length > 0
      ? await db
        .from('enrollments')
        .select('id,name,phone,exam_number')
        .eq('course_id', course.id)
        .in('id', enrollmentIds)
      : { data: [], error: null }

    if (enrollmentResult.error) {
      throw enrollmentResult.error
    }

    const enrollmentMap = new Map((enrollmentResult.data ?? []).map((row) => [Number(row.id), row]))
    const issues = events.map((event) => {
      const details: Record<string, unknown> = event.details && typeof event.details === 'object' && !Array.isArray(event.details)
        ? event.details as Record<string, unknown>
        : {}
      const occurredAt = typeof details.occurred_at === 'string' ? details.occurred_at : event.created_at
      return {
        id: Number(event.id),
        eventType: event.event_type,
        details,
        createdAt: occurredAt,
        recordedAt: event.created_at,
        resolution: resolutionMap.get(Number(event.id)) ?? null,
        enrollment: event.enrollment_id
          ? enrollmentMap.get(Number(event.enrollment_id)) ?? null
          : null,
      }
    })
    const lastEvent = events.at(-1)
    const nextCursor = hasMore && lastEvent
      ? { createdAt: lastEvent.created_at, id: Number(lastEvent.id) }
      : null

    const unresolvedEvents = allIssueEvents.filter((event) => !resolutionMap.has(Number(event.id)))
    const summary = {
      totalIssues: allIssueEvents.length,
      resolvedIssues: allIssueEvents.length - unresolvedEvents.length,
      unresolvedIssues: unresolvedEvents.length,
      affectedStudents: new Set(allIssueEvents.map((event) => event.enrollment_id).filter(Boolean)).size,
      unresolvedStudents: new Set(unresolvedEvents.map((event) => event.enrollment_id).filter(Boolean)).size,
      noDecode: allIssueEvents.filter((event) => event.event_type === 'student_qr_no_decode').length,
      cameraFailed: allIssueEvents.filter((event) => event.event_type === 'student_qr_camera_failed').length,
      authRejected: allIssueEvents.filter((event) => event.event_type === 'student_qr_auth_rejected').length,
    }

    return NextResponse.json({
      date: parsed.data.date,
      issues,
      total: allIssueEvents.length,
      summary,
      hasMore,
      nextCursor,
    })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.scanIssues.GET', 'QR 문제 내역을 불러오지 못했습니다.', error)
  }
}
