import { getAppConfig } from '@/lib/app-config'
import { toReceiptMap } from '@/lib/bulk'
import { generateQrToken } from '@/lib/qr/token'
import { createServerClient } from '@/lib/supabase/server'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import type {
  Course,
  CourseSubject,
  Enrollment,
  Material,
  PassCourseSummary,
  PassPayload,
  SeatAssignment,
} from '@/types/database'
import type { TenantType } from '@/lib/tenant'
import { normalizeName, normalizePhone } from '@/lib/utils'

type AttendanceRow = { course_id: number; enrollment_id: number; attended_at: string }
type CourseOrderInfo = { sortOrder: number | null; index: number }
type ServerClient = ReturnType<typeof createServerClient>
type ReceiptRow = { material_id: number; distributed_at: string }

async function listOrderedActiveCoursesForPass(
  db: ServerClient,
  division: TenantType,
  courseIds: number[],
): Promise<Course[]> {
  const courses = unwrapSupabaseResult(
    'listStudentCourses.courses',
    await db
      .from('courses')
      .select('*')
      .in('id', courseIds)
      .eq('division', division)
      .eq('status', 'active')
      .order('sort_order')
      .order('id'),
  )

  return (courses ?? []) as Course[]
}

function getPassAttendanceCourseIds(orderedCourses: Course[], attendanceEnabled: boolean) {
  return orderedCourses
    .filter((course) => Boolean(attendanceEnabled && course.feature_attendance))
    .map((course) => course.id)
}

async function loadPassAttendanceContext(params: {
  db: ServerClient
  attendanceCourseIds: number[]
  enrollmentIds: number[]
  todayKey: string
}) {
  const [attendanceRows, activeAttendanceSessions] = await Promise.all([
    params.attendanceCourseIds.length === 0
      ? Promise.resolve([] as AttendanceRow[])
      : (async () => {
        const rows = unwrapSupabaseResult(
          'listStudentCourses.attendanceRows',
          await params.db
            .from('attendance_records')
            .select('course_id,enrollment_id,attended_at')
            .in('course_id', params.attendanceCourseIds)
            .in('enrollment_id', params.enrollmentIds)
            .eq('attended_date', params.todayKey),
        ) as AttendanceRow[] | null

        return rows ?? []
      })(),
    params.attendanceCourseIds.length === 0
      ? Promise.resolve(new Set<number>())
      : (async () => {
        const rows = unwrapSupabaseResult(
          'listStudentCourses.activeAttendanceSessions',
          await params.db
            .from('attendance_display_sessions')
            .select('course_id')
            .in('course_id', params.attendanceCourseIds)
            .is('revoked_at', null)
            .gt('expires_at', new Date().toISOString()),
        ) as Array<{ course_id: number }> | null

        return new Set((rows ?? []).map((row) => Number(row.course_id)))
      })(),
  ])

  return {
    attendanceRecordMap: new Map(
      attendanceRows.map((row) => [`${row.course_id}:${row.enrollment_id}`, row]),
    ),
    activeAttendanceSessions,
  }
}

function createPassCourseOrderMap(orderedCourses: Course[]) {
  return new Map<number, CourseOrderInfo>(
    orderedCourses.map((course, index) => [
      course.id,
      {
        sortOrder: course.sort_order,
        index,
      },
    ]),
  )
}

function createPassSummaryCourse(course: Course): PassCourseSummary['course'] {
  return {
    id: course.id,
    name: course.name,
    slug: course.slug,
    course_type: course.course_type,
    theme_color: course.theme_color,
    feature_qr_pass: course.feature_qr_pass,
    feature_qr_distribution: course.feature_qr_distribution,
    feature_seat_assignment: course.feature_seat_assignment,
    feature_designated_seat: course.feature_designated_seat,
    feature_attendance: Boolean(course.feature_attendance),
    feature_time_window: course.feature_time_window,
    feature_dday: course.feature_dday,
    feature_exam_delivery_mode: course.feature_exam_delivery_mode,
    feature_weekday_color: course.feature_weekday_color,
    feature_anti_forgery_motion: course.feature_anti_forgery_motion,
  }
}

function createPassCourseSummary(params: {
  enrollment: Pick<Enrollment, 'id' | 'course_id' | 'status'>
  course: Course
  attendanceEnabled: boolean
  attendanceRecordMap: Map<string, AttendanceRow>
  activeAttendanceSessions: Set<number>
}): PassCourseSummary {
  const attendanceRecord = params.attendanceRecordMap.get(`${params.course.id}:${params.enrollment.id}`)

  return {
    enrollment_id: params.enrollment.id,
    course: createPassSummaryCourse(params.course),
    attendance: {
      enabled: Boolean(params.attendanceEnabled && params.course.feature_attendance),
      open: Boolean(
        params.attendanceEnabled
          && params.course.feature_attendance
          && params.course.attendance_open
          && params.activeAttendanceSessions.has(params.course.id),
      ),
      attended_today: Boolean(attendanceRecord),
      attended_at: attendanceRecord?.attended_at ?? null,
    },
  }
}

function sortPassCourseSummaries(
  summaries: PassCourseSummary[],
  courseOrderMap: Map<number, CourseOrderInfo>,
) {
  return summaries.sort((left, right) => {
    const leftOrder = courseOrderMap.get(left.course.id)
    const rightOrder = courseOrderMap.get(right.course.id)
    const leftSort = leftOrder?.sortOrder ?? Number.MAX_SAFE_INTEGER
    const rightSort = rightOrder?.sortOrder ?? Number.MAX_SAFE_INTEGER

    if (leftSort !== rightSort) {
      return leftSort - rightSort
    }

    const leftIndex = leftOrder?.index ?? Number.MAX_SAFE_INTEGER
    const rightIndex = rightOrder?.index ?? Number.MAX_SAFE_INTEGER
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex
    }

    return left.enrollment_id - right.enrollment_id
  })
}

function filterReceiptRowsByMaterialIds(rows: ReceiptRow[], materialIds: number[]) {
  const materialIdSet = new Set(materialIds)
  return rows.filter((row) => materialIdSet.has(row.material_id))
}

export async function buildPassCourseSummaries(
  division: TenantType,
  enrollmentRows: Array<Pick<Enrollment, 'id' | 'course_id' | 'status'>>,
  courseIds: number[],
): Promise<PassCourseSummary[]> {
  const db = createServerClient()
  const todayKey = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const appConfig = await getAppConfig()
  const attendanceEnabled = appConfig.attendance_enabled
  const orderedCourses = await listOrderedActiveCoursesForPass(db, division, courseIds)
  const attendanceCourseIds = getPassAttendanceCourseIds(orderedCourses, attendanceEnabled)
  const enrollmentIds = enrollmentRows.map((row) => row.id)
  const { attendanceRecordMap, activeAttendanceSessions } = await loadPassAttendanceContext({
    db,
    attendanceCourseIds,
    enrollmentIds,
    todayKey,
  })
  const courseMap = new Map(orderedCourses.map((course) => [course.id, course]))
  const courseOrderMap = createPassCourseOrderMap(orderedCourses)
  const summaries = enrollmentRows
    .map((enrollment) => {
      const course = courseMap.get(enrollment.course_id)
      if (!course) {
        return null
      }

      return createPassCourseSummary({
        enrollment,
        course,
        attendanceEnabled,
        attendanceRecordMap,
        activeAttendanceSessions,
      })
    })
    .filter((value): value is PassCourseSummary => Boolean(value))

  return sortPassCourseSummaries(summaries, courseOrderMap)
}

export function isPassRequestMatch(params: {
  enrollment: Enrollment
  name: string
  phone: string
}) {
  return normalizeName(params.enrollment.name) === normalizeName(params.name)
    && normalizePhone(params.enrollment.phone) === normalizePhone(params.phone)
}

export async function buildPassPayloadResult(params: {
  appConfig: PassPayload['appConfig']
  course: Course
  enrollment: Enrollment
  subjects: CourseSubject[]
  seatAssignments: SeatAssignment[]
  designatedSeat: PassPayload['designatedSeat']
  attendance: PassPayload['attendance']
  materials: Material[]
  textbooks: Material[]
  receiptRows: ReceiptRow[] | null
}): Promise<PassPayload> {
  const effectiveAttendance = params.appConfig.attendance_enabled
    ? params.attendance
    : {
      enabled: false,
      open: false,
      attended_today: false,
      attended_at: null,
    }
  const receiptRows = params.receiptRows ?? []

  return {
    appConfig: params.appConfig,
    course: params.course,
    enrollment: params.enrollment,
    subjects: params.subjects,
    seatAssignments: params.seatAssignments,
    designatedSeat: params.designatedSeat,
    attendance: effectiveAttendance,
    materials: params.materials,
    receipts: toReceiptMap(
      filterReceiptRowsByMaterialIds(receiptRows, params.materials.map((material) => material.id)),
    ),
    textbooks: params.textbooks,
    textbookReceipts: toReceiptMap(
      filterReceiptRowsByMaterialIds(receiptRows, params.textbooks.map((material) => material.id)),
    ),
    qrToken: params.course.feature_qr_pass && params.enrollment.status === 'active'
      ? await generateQrToken(params.enrollment.id, params.course.id)
      : '',
  }
}
