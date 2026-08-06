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
  DESIGNATED_SEAT_SCAN_ISSUES_PAGE_SIZE,
  getKstDateBounds,
  isValidKstDateKey,
} from '@/lib/designated-seat/scan-issues-query'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

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
    const baseCountQuery = db
      .from('course_seat_events')
      .select('id', { count: 'exact', head: true })
      .eq('course_id', course.id)
      .in('event_type', [...DESIGNATED_SEAT_SCAN_ISSUE_EVENT_TYPES])
      .gte('created_at', startIso)
      .lt('created_at', endIso)

    let eventQuery = db
      .from('course_seat_events')
      .select('id,enrollment_id,event_type,details,created_at')
      .eq('course_id', course.id)
      .in('event_type', [...DESIGNATED_SEAT_SCAN_ISSUE_EVENT_TYPES])
      .gte('created_at', startIso)
      .lt('created_at', endIso)

    if (parsed.data.cursorCreatedAt && parsed.data.cursorId) {
      eventQuery = eventQuery.or(
        `created_at.lt.${parsed.data.cursorCreatedAt},and(created_at.eq.${parsed.data.cursorCreatedAt},id.lt.${parsed.data.cursorId})`,
      )
    }

    eventQuery = eventQuery
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(DESIGNATED_SEAT_SCAN_ISSUES_PAGE_SIZE + 1)

    const [countResult, eventResult] = await Promise.all([baseCountQuery, eventQuery])

    if (countResult.error) {
      throw countResult.error
    }
    if (eventResult.error) {
      throw eventResult.error
    }

    const fetchedEvents = (eventResult.data ?? []).filter(
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
      const details = event.details && typeof event.details === 'object' && !Array.isArray(event.details)
        ? event.details
        : {}
      const occurredAt = typeof details.occurred_at === 'string' ? details.occurred_at : event.created_at
      return {
        id: Number(event.id),
        eventType: event.event_type,
        details,
        createdAt: occurredAt,
        recordedAt: event.created_at,
        enrollment: event.enrollment_id
          ? enrollmentMap.get(Number(event.enrollment_id)) ?? null
          : null,
      }
    })
    const lastEvent = events.at(-1)
    const nextCursor = hasMore && lastEvent
      ? { createdAt: lastEvent.created_at, id: Number(lastEvent.id) }
      : null

    return NextResponse.json({
      date: parsed.data.date,
      issues,
      total: countResult.count ?? issues.length,
      hasMore,
      nextCursor,
    })
  } catch (error) {
    return handleRouteError('designatedSeats.admin.scanIssues.GET', 'QR 문제 내역을 불러오지 못했습니다.', error)
  }
}
