import 'server-only'

import { getPendingStudentAuthStats } from '@/lib/student-profiles'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { createServerClient } from '@/lib/supabase/server'
import type { TenantType } from '@/lib/tenant'
import type { CourseType } from '@/types/database'

type DashboardCourseRow = {
  id: number
  name: string
  course_type: CourseType
  feature_qr_pass: boolean
  feature_qr_distribution: boolean
  feature_seat_assignment: boolean
  feature_designated_seat: boolean
  feature_attendance: boolean
  designated_seat_open: boolean
  attendance_open: boolean
  sort_order: number
  created_at: string
}

type DashboardEnrollmentRow = {
  course_id: number
  status: 'active' | 'refunded'
}

type DashboardSessionRow = {
  course_id: number
  expires_at: string
  created_at: string
}

type DashboardSeatRow = {
  course_id: number
}

type DashboardLayoutRow = {
  course_id: number
}

export type DashboardCourseSummary = {
  id: number
  name: string
  courseType: CourseType
  activeStudents: number
  refundedStudents: number
  featureQrPass: boolean
  featureDistribution: boolean
  featureSeatAssignment: boolean
  featureDesignatedSeat: boolean
  featureAttendance: boolean
  attendanceOpen: boolean
  designatedSeatOpen: boolean
  attendanceSessionActive: boolean
  attendanceSessionExpiresAt: string | null
  designatedSeatSessionActive: boolean
  designatedSeatSessionExpiresAt: string | null
  designatedSeatLayoutReady: boolean
  designatedSeatSeatCount: number
  needsAttention: boolean
  needsAttendanceSession: boolean
  needsDesignatedSeatLayout: boolean
  needsDesignatedSeatSession: boolean
}

export type DashboardStats = {
  overview: {
    activeCourses: number
    activeStudents: number
    pendingAuthStudents: number
    actionRequiredCourses: number
  }
  auth: {
    total: number
    birthDateReadyCount: number
    pinRequiredCount: number
  }
  featureUsage: {
    attendanceCourses: number
    designatedSeatCourses: number
    seatAssignmentCourses: number
    distributionCourses: number
    qrPassCourses: number
  }
  actionItems: {
    pendingStudentAuth: number
    attendanceNeedsSession: number
    designatedSeatNeedsLayout: number
    designatedSeatNeedsSession: number
  }
  courses: DashboardCourseSummary[]
}

function makeEmptyDashboardStats(): DashboardStats {
  return {
    overview: {
      activeCourses: 0,
      activeStudents: 0,
      pendingAuthStudents: 0,
      actionRequiredCourses: 0,
    },
    auth: {
      total: 0,
      birthDateReadyCount: 0,
      pinRequiredCount: 0,
    },
    featureUsage: {
      attendanceCourses: 0,
      designatedSeatCourses: 0,
      seatAssignmentCourses: 0,
      distributionCourses: 0,
      qrPassCourses: 0,
    },
    actionItems: {
      pendingStudentAuth: 0,
      attendanceNeedsSession: 0,
      designatedSeatNeedsLayout: 0,
      designatedSeatNeedsSession: 0,
    },
    courses: [],
  }
}

function getLatestSessionMap(rows: DashboardSessionRow[]) {
  const sessionMap = new Map<number, { active: true; expiresAt: string }>()

  for (const row of rows) {
    if (sessionMap.has(row.course_id)) {
      continue
    }

    sessionMap.set(row.course_id, {
      active: true,
      expiresAt: row.expires_at,
    })
  }

  return sessionMap
}

export async function getDashboardStats(division: TenantType): Promise<DashboardStats> {
  const db = createServerClient()

  const [coursesResult, authStats] = await Promise.all([
    db
      .from('courses')
      .select(`
        id,
        name,
        course_type,
        feature_qr_pass,
        feature_qr_distribution,
        feature_seat_assignment,
        feature_designated_seat,
        feature_attendance,
        designated_seat_open,
        attendance_open,
        sort_order,
        created_at
      `)
      .eq('division', division)
      .eq('status', 'active')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    getPendingStudentAuthStats(db, division),
  ])

  const courses = (unwrapSupabaseResult(
    'dashboardStats.courses',
    coursesResult,
  ) ?? []) as DashboardCourseRow[]

  if (courses.length === 0) {
    const empty = makeEmptyDashboardStats()
    return {
      ...empty,
      overview: {
        ...empty.overview,
        pendingAuthStudents: authStats.total,
      },
      auth: {
        total: authStats.total,
        birthDateReadyCount: authStats.birthDateReadyCount,
        pinRequiredCount: authStats.pinRequiredCount,
      },
      actionItems: {
        ...empty.actionItems,
        pendingStudentAuth: authStats.total,
      },
    }
  }

  const courseIds = courses.map((course) => course.id)
  const nowIso = new Date().toISOString()

  const [
    enrollmentsResult,
    attendanceSessionsResult,
    designatedSeatSessionsResult,
    designatedSeatLayoutsResult,
    designatedSeatsResult,
  ] = await Promise.all([
    db
      .from('enrollments')
      .select('course_id,status')
      .in('course_id', courseIds),
    db
      .from('attendance_display_sessions')
      .select('course_id,expires_at,created_at')
      .in('course_id', courseIds)
      .is('revoked_at', null)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false }),
    db
      .from('course_seat_display_sessions')
      .select('course_id,expires_at,created_at')
      .in('course_id', courseIds)
      .is('revoked_at', null)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false }),
    db
      .from('course_seat_layouts')
      .select('course_id')
      .in('course_id', courseIds),
    db
      .from('course_seats')
      .select('course_id')
      .in('course_id', courseIds)
      .eq('is_active', true),
  ])

  const enrollments = (unwrapSupabaseResult(
    'dashboardStats.enrollments',
    enrollmentsResult,
  ) ?? []) as DashboardEnrollmentRow[]
  const attendanceSessions = (unwrapSupabaseResult(
    'dashboardStats.attendanceSessions',
    attendanceSessionsResult,
  ) ?? []) as DashboardSessionRow[]
  const designatedSeatSessions = (unwrapSupabaseResult(
    'dashboardStats.designatedSeatSessions',
    designatedSeatSessionsResult,
  ) ?? []) as DashboardSessionRow[]
  const designatedSeatLayouts = (unwrapSupabaseResult(
    'dashboardStats.designatedSeatLayouts',
    designatedSeatLayoutsResult,
  ) ?? []) as DashboardLayoutRow[]
  const designatedSeats = (unwrapSupabaseResult(
    'dashboardStats.designatedSeats',
    designatedSeatsResult,
  ) ?? []) as DashboardSeatRow[]

  const enrollmentCountMap = new Map<number, { active: number; refunded: number }>()
  for (const enrollment of enrollments) {
    const current = enrollmentCountMap.get(enrollment.course_id) ?? { active: 0, refunded: 0 }
    if (enrollment.status === 'refunded') {
      current.refunded += 1
    } else {
      current.active += 1
    }
    enrollmentCountMap.set(enrollment.course_id, current)
  }

  const attendanceSessionMap = getLatestSessionMap(attendanceSessions)
  const designatedSeatSessionMap = getLatestSessionMap(designatedSeatSessions)
  const designatedSeatLayoutCourseIds = new Set(designatedSeatLayouts.map((row) => row.course_id))
  const designatedSeatCountMap = new Map<number, number>()

  for (const seat of designatedSeats) {
    designatedSeatCountMap.set(
      seat.course_id,
      (designatedSeatCountMap.get(seat.course_id) ?? 0) + 1,
    )
  }

  const courseSummaries = courses
    .map((course) => {
      const enrollmentCounts = enrollmentCountMap.get(course.id) ?? { active: 0, refunded: 0 }
      const attendanceSession = attendanceSessionMap.get(course.id)
      const designatedSeatSession = designatedSeatSessionMap.get(course.id)
      const designatedSeatLayoutReady = designatedSeatLayoutCourseIds.has(course.id)
      const designatedSeatSeatCount = designatedSeatCountMap.get(course.id) ?? 0

      const needsAttendanceSession = Boolean(
        course.feature_attendance
        && course.attendance_open
        && !attendanceSession,
      )
      const needsDesignatedSeatLayout = Boolean(
        course.feature_designated_seat
        && course.designated_seat_open
        && (!designatedSeatLayoutReady || designatedSeatSeatCount === 0),
      )
      const needsDesignatedSeatSession = Boolean(
        course.feature_designated_seat
        && course.designated_seat_open
        && !needsDesignatedSeatLayout
        && !designatedSeatSession,
      )

      return {
        id: course.id,
        name: course.name,
        courseType: course.course_type,
        activeStudents: enrollmentCounts.active,
        refundedStudents: enrollmentCounts.refunded,
        featureQrPass: course.feature_qr_pass,
        featureDistribution: course.feature_qr_distribution,
        featureSeatAssignment: course.feature_seat_assignment,
        featureDesignatedSeat: course.feature_designated_seat,
        featureAttendance: course.feature_attendance,
        attendanceOpen: course.attendance_open,
        designatedSeatOpen: course.designated_seat_open,
        attendanceSessionActive: Boolean(attendanceSession),
        attendanceSessionExpiresAt: attendanceSession?.expiresAt ?? null,
        designatedSeatSessionActive: Boolean(designatedSeatSession),
        designatedSeatSessionExpiresAt: designatedSeatSession?.expiresAt ?? null,
        designatedSeatLayoutReady,
        designatedSeatSeatCount,
        needsAttention:
          needsAttendanceSession
          || needsDesignatedSeatLayout
          || needsDesignatedSeatSession,
        needsAttendanceSession,
        needsDesignatedSeatLayout,
        needsDesignatedSeatSession,
      } satisfies DashboardCourseSummary
    })
    .sort((left, right) => {
      if (left.needsAttention !== right.needsAttention) {
        return left.needsAttention ? -1 : 1
      }

      return left.name.localeCompare(right.name, 'ko-KR')
    })

  const actionRequiredCourses = courseSummaries.filter((course) => course.needsAttention).length
  const attendanceNeedsSession = courseSummaries.filter((course) => course.needsAttendanceSession).length
  const designatedSeatNeedsLayout = courseSummaries.filter((course) => course.needsDesignatedSeatLayout).length
  const designatedSeatNeedsSession = courseSummaries.filter((course) => course.needsDesignatedSeatSession).length

  return {
    overview: {
      activeCourses: courses.length,
      activeStudents: courseSummaries.reduce((sum, course) => sum + course.activeStudents, 0),
      pendingAuthStudents: authStats.total,
      actionRequiredCourses,
    },
    auth: {
      total: authStats.total,
      birthDateReadyCount: authStats.birthDateReadyCount,
      pinRequiredCount: authStats.pinRequiredCount,
    },
    featureUsage: {
      attendanceCourses: courseSummaries.filter((course) => course.featureAttendance).length,
      designatedSeatCourses: courseSummaries.filter((course) => course.featureDesignatedSeat).length,
      seatAssignmentCourses: courseSummaries.filter((course) => course.featureSeatAssignment).length,
      distributionCourses: courseSummaries.filter((course) => course.featureDistribution).length,
      qrPassCourses: courseSummaries.filter((course) => course.featureQrPass).length,
    },
    actionItems: {
      pendingStudentAuth: authStats.total,
      attendanceNeedsSession,
      designatedSeatNeedsLayout,
      designatedSeatNeedsSession,
    },
    courses: courseSummaries,
  }
}
