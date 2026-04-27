import { normalizeName, normalizePhone } from '@/lib/utils'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { createServerClient } from '@/lib/supabase/server'
import type {
  AttendanceDisplaySession,
  AttendanceDeviceState,
  AttendanceEvent,
  AttendanceRecord,
  AttendanceStudentState,
  Course,
  Enrollment,
} from '@/types/database'

function getKstDateKey(value: string | number | Date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
  }).format(new Date(value))
}

function getKstDateRange(dateKey: string) {
  const start = new Date(`${dateKey}T00:00:00+09:00`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

export function getAttendanceTodayKey() {
  return getKstDateKey()
}

function hasAttendanceStartedForDate(targetDate: string, attendanceStartDate?: string | null) {
  if (!attendanceStartDate) {
    return true
  }

  return targetDate >= attendanceStartDate.slice(0, 10)
}

export function hasCourseAttendanceStarted(
  course: Pick<Course, 'enrolled_from'>,
  targetDate = getAttendanceTodayKey(),
) {
  return hasAttendanceStartedForDate(targetDate, course.enrolled_from)
}

function getEffectiveAttendanceStartDate(
  courseAttendanceStartDate?: string | null,
  enrollmentCreatedAt?: string | null,
) {
  const normalizedCourseDate = courseAttendanceStartDate?.slice(0, 10) ?? null
  const normalizedEnrollmentDate = enrollmentCreatedAt
    ? getKstDateKey(enrollmentCreatedAt)
    : null

  if (!normalizedCourseDate) {
    return normalizedEnrollmentDate
  }

  if (!normalizedEnrollmentDate) {
    return normalizedCourseDate
  }

  return normalizedEnrollmentDate > normalizedCourseDate
    ? normalizedEnrollmentDate
    : normalizedCourseDate
}

export function getEnrollmentAttendanceStartDate(
  course: Pick<Course, 'enrolled_from'>,
  enrollment: Pick<Enrollment, 'created_at'>,
) {
  return getEffectiveAttendanceStartDate(course.enrolled_from, enrollment.created_at)
}

export function hasEnrollmentAttendanceStarted(params: {
  course: Pick<Course, 'enrolled_from'>
  enrollment: Pick<Enrollment, 'created_at'>
  targetDate?: string
}) {
  return hasAttendanceStartedForDate(
    params.targetDate ?? getAttendanceTodayKey(),
    getEnrollmentAttendanceStartDate(params.course, params.enrollment),
  )
}

function mapAttendanceDisplaySessionRow(row: Record<string, unknown>): AttendanceDisplaySession {
  return {
    id: Number(row.id),
    course_id: Number(row.course_id),
    subject_id: row.subject_id == null ? null : Number(row.subject_id),
    display_token_hash: String(row.display_token_hash ?? ''),
    created_by: String(row.created_by ?? 'admin'),
    expires_at: String(row.expires_at ?? ''),
    revoked_at: row.revoked_at ? String(row.revoked_at) : null,
    last_seen_at: String(row.last_seen_at ?? ''),
    created_at: String(row.created_at ?? ''),
  }
}

function mapAttendanceRecordRow(row: Record<string, unknown>): AttendanceRecord {
  return {
    id: Number(row.id),
    course_id: Number(row.course_id),
    enrollment_id: Number(row.enrollment_id),
    display_session_id: row.display_session_id == null ? null : Number(row.display_session_id),
    subject_id: row.subject_id == null ? null : Number(row.subject_id),
    device_key_hash: String(row.device_key_hash ?? ''),
    attended_date: String(row.attended_date ?? ''),
    attended_at: String(row.attended_at ?? ''),
    created_at: String(row.created_at ?? ''),
  }
}

export class AttendanceServiceError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'AttendanceServiceError'
    this.status = status
  }
}

const ATTENDANCE_EXCUSE_MIGRATION_MESSAGE =
  '출석 사유서 DB migration이 아직 적용되지 않았습니다. `202604220001_attendance_excuses.sql`을 먼저 적용해 주세요.'

const ATTENDANCE_DEVICE_BINDINGS_MIGRATION_MESSAGE =
  '출석 기기 등록 DB migration이 아직 적용되지 않았습니다. `202604240001_attendance_device_bindings.sql`을 먼저 적용해 주세요.'

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object') {
    const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
    const details = 'details' in error && typeof error.details === 'string' ? error.details : ''
    const hint = 'hint' in error && typeof error.hint === 'string' ? error.hint : ''

    return [message, details, hint].filter(Boolean).join(' | ')
  }

  return ''
}

function isMissingAttendanceExcuseDependencyError(error: unknown) {
  const message = getErrorMessage(error)

  return (
    message.includes('relation "attendance_excuses" does not exist')
    || message.includes('relation "class_pass.attendance_excuses" does not exist')
    || message.includes("Could not find the table 'class_pass.attendance_excuses' in the schema cache")
    || message.includes('Could not find the table')
    || message.includes('Could not find the function class_pass.get_attendance_absence_metrics')
    || (message.includes('get_attendance_absence_metrics') && message.includes('does not exist'))
    || (
      message.includes('attendance_events_type_check')
      && (
        message.includes('admin_created_excuse')
        || message.includes('admin_updated_excuse')
        || message.includes('admin_deleted_excuse')
      )
    )
  )
}

function isMissingAttendanceDeviceBindingDependencyError(error: unknown) {
  const message = getErrorMessage(error)

  return (
    message.includes('relation "attendance_device_bindings" does not exist')
    || message.includes('relation "class_pass.attendance_device_bindings" does not exist')
    || message.includes("Could not find the table 'class_pass.attendance_device_bindings' in the schema cache")
    || (
      message.includes('attendance_events_type_check')
      && (
        message.includes('attendance_device_registered')
        || message.includes('attendance_device_locked')
        || message.includes('attendance_device_rebind_requested')
        || message.includes('attendance_device_rebind_approved')
        || message.includes('attendance_device_binding_reset')
      )
    )
  )
}

export function normalizeAttendanceExcuseDependencyError(error: unknown) {
  if (error instanceof AttendanceServiceError) {
    return error
  }

  if (isMissingAttendanceExcuseDependencyError(error)) {
    return new AttendanceServiceError(ATTENDANCE_EXCUSE_MIGRATION_MESSAGE, 503)
  }

  return error
}

function normalizeAttendanceDeviceBindingDependencyError(error: unknown) {
  if (error instanceof AttendanceServiceError) {
    return error
  }

  if (isMissingAttendanceDeviceBindingDependencyError(error)) {
    return new AttendanceServiceError(ATTENDANCE_DEVICE_BINDINGS_MIGRATION_MESSAGE, 503)
  }

  return error
}

type AttendanceDeviceBindingRow = {
  id: number
  course_id: number
  enrollment_id: number
  device_key_hash: string
  is_active: boolean
  bound_at: string
  last_seen_at: string | null
  reset_requested_at: string | null
  reset_requested_device_key_hash: string | null
  reset_requested_user_agent: string | null
  reset_approved_at: string | null
  reset_approved_by: string | null
  retired_at: string | null
  retired_by: string | null
  retirement_reason: string | null
  created_at: string
  updated_at: string
}

export const ATTENDANCE_DEVICE_BINDING_LIMIT = 3

function getTimestamp(value: string | null | undefined) {
  const timestamp = value ? Date.parse(value) : 0
  return Number.isFinite(timestamp) ? timestamp : 0
}

function getBindingActivityTimestamp(row: AttendanceDeviceBindingRow) {
  return getTimestamp(row.last_seen_at ?? row.bound_at ?? row.created_at)
}

function mapAttendanceDeviceStateFromRows(rows: AttendanceDeviceBindingRow[]): AttendanceDeviceState {
  if (rows.length === 0) {
    return {
      status: 'unregistered',
      bound_at: null,
      last_seen_at: null,
      reset_requested_at: null,
      reset_requested_user_agent: null,
      registered_count: 0,
      max_device_count: ATTENDANCE_DEVICE_BINDING_LIMIT,
    }
  }

  const pendingRow = rows
    .filter((row) => row.reset_requested_at)
    .sort((a, b) => getTimestamp(b.reset_requested_at) - getTimestamp(a.reset_requested_at))[0] ?? null
  const earliestBoundRow = [...rows].sort((a, b) => getTimestamp(a.bound_at) - getTimestamp(b.bound_at))[0] ?? null
  const latestSeenRow = [...rows].sort((a, b) => getBindingActivityTimestamp(b) - getBindingActivityTimestamp(a))[0] ?? null

  return {
    status: pendingRow ? 'pending_reset' : 'active',
    bound_at: earliestBoundRow?.bound_at ?? null,
    last_seen_at: latestSeenRow?.last_seen_at ?? null,
    reset_requested_at: pendingRow?.reset_requested_at ?? null,
    reset_requested_user_agent: pendingRow?.reset_requested_user_agent ?? null,
    registered_count: rows.length,
    max_device_count: ATTENDANCE_DEVICE_BINDING_LIMIT,
  }
}

function mapAttendanceDeviceState(row: AttendanceDeviceBindingRow | null | undefined): AttendanceDeviceState {
  return mapAttendanceDeviceStateFromRows(row ? [row] : [])
}

function sanitizeDeviceUserAgent(value: string | null | undefined) {
  const trimmed = value?.trim() ?? ''
  return trimmed ? trimmed.slice(0, 500) : null
}

async function getActiveAttendanceDeviceBindings(params: {
  courseId: number
  enrollmentId: number
}) {
  const db = createServerClient()
  const result = await db
    .from('attendance_device_bindings')
    .select('*')
    .eq('course_id', params.courseId)
    .eq('enrollment_id', params.enrollmentId)
    .eq('is_active', true)
    .order('bound_at', { ascending: true })

  if (result.error) {
    throw normalizeAttendanceDeviceBindingDependencyError(result.error)
  }

  return (result.data ?? []) as AttendanceDeviceBindingRow[]
}

export async function listAttendanceDeviceStatesForCourse(
  courseId: number,
  enrollmentIds?: number[],
): Promise<Map<number, AttendanceDeviceState>> {
  const result = new Map<number, AttendanceDeviceState>()
  const normalizedEnrollmentIds = Array.from(new Set(
    (enrollmentIds ?? []).filter((enrollmentId) => Number.isInteger(enrollmentId) && enrollmentId > 0),
  ))

  if (enrollmentIds && normalizedEnrollmentIds.length === 0) {
    return result
  }

  const db = createServerClient()
  let query = db
    .from('attendance_device_bindings')
    .select('*')
    .eq('course_id', courseId)
    .eq('is_active', true)

  if (normalizedEnrollmentIds.length > 0) {
    query = query.in('enrollment_id', normalizedEnrollmentIds)
  }

  const response = await query

  if (response.error) {
    if (isMissingAttendanceDeviceBindingDependencyError(response.error)) {
      return result
    }

    throw response.error
  }

  const rowsByEnrollment = new Map<number, AttendanceDeviceBindingRow[]>()
  for (const row of (response.data ?? []) as AttendanceDeviceBindingRow[]) {
    const enrollmentId = Number(row.enrollment_id)
    rowsByEnrollment.set(enrollmentId, [
      ...(rowsByEnrollment.get(enrollmentId) ?? []),
      row,
    ])
  }

  for (const [enrollmentId, rows] of rowsByEnrollment.entries()) {
    result.set(enrollmentId, mapAttendanceDeviceStateFromRows(rows))
  }

  return result
}

export type AttendanceDeviceBindingCheckResult =
  | {
    ok: true
    state: AttendanceDeviceState
  }
  | {
    ok: false
    code: 'DEVICE_LOCKED' | 'DEVICE_REBIND_REQUIRED'
    state: AttendanceDeviceState
  }

export async function enforceAttendanceDeviceBinding(params: {
  courseId: number
  enrollmentId: number
  deviceKeyHash: string
  userAgent?: string | null
}): Promise<AttendanceDeviceBindingCheckResult> {
  const db = createServerClient()
  const deviceKeyHash = params.deviceKeyHash.trim()
  const nowIso = new Date().toISOString()
  const resetRequestedUserAgent = sanitizeDeviceUserAgent(params.userAgent)

  if (!deviceKeyHash) {
    throw new AttendanceServiceError('기기 식별 정보가 올바르지 않습니다.', 400)
  }

  const [ownBindingsResult, deviceOwnerResult] = await Promise.all([
    db
      .from('attendance_device_bindings')
      .select('*')
      .eq('course_id', params.courseId)
      .eq('enrollment_id', params.enrollmentId)
      .eq('is_active', true),
    db
      .from('attendance_device_bindings')
      .select('*')
      .eq('course_id', params.courseId)
      .eq('device_key_hash', deviceKeyHash)
      .eq('is_active', true)
      .maybeSingle(),
  ])

  if (ownBindingsResult.error) {
    throw normalizeAttendanceDeviceBindingDependencyError(ownBindingsResult.error)
  }

  if (deviceOwnerResult.error) {
    throw normalizeAttendanceDeviceBindingDependencyError(deviceOwnerResult.error)
  }

  const ownBindings = (ownBindingsResult.data ?? []) as AttendanceDeviceBindingRow[]
  const deviceOwner = deviceOwnerResult.data as AttendanceDeviceBindingRow | null

  if (deviceOwner && Number(deviceOwner.enrollment_id) !== params.enrollmentId) {
    await logAttendanceEvent({
      course_id: params.courseId,
      event_type: 'attendance_device_locked',
      details: {
        enrollment_id: params.enrollmentId,
        registered_enrollment_id: Number(deviceOwner.enrollment_id),
      },
    })

    return {
      ok: false,
      code: 'DEVICE_LOCKED',
      state: mapAttendanceDeviceStateFromRows(ownBindings),
    }
  }

  const matchingBinding = ownBindings.find((binding) => binding.device_key_hash === deviceKeyHash) ?? null

  if (matchingBinding) {
    const updateResult = await db
      .from('attendance_device_bindings')
      .update({
        last_seen_at: nowIso,
        reset_requested_at: null,
        reset_requested_device_key_hash: null,
        reset_requested_user_agent: null,
        updated_at: nowIso,
      })
      .eq('id', matchingBinding.id)
      .select('*')
      .maybeSingle()

    if (updateResult.error) {
      throw normalizeAttendanceDeviceBindingDependencyError(updateResult.error)
    }

    const updatedBinding = updateResult.data as AttendanceDeviceBindingRow | null
    return {
      ok: true,
      state: mapAttendanceDeviceStateFromRows(
        updatedBinding
          ? ownBindings.map((binding) => (binding.id === updatedBinding.id ? updatedBinding : binding))
          : ownBindings,
      ),
    }
  }

  let bindingsForPending = ownBindings
  if (ownBindings.length < ATTENDANCE_DEVICE_BINDING_LIMIT) {
    const insertResult = await db
      .from('attendance_device_bindings')
      .insert({
        course_id: params.courseId,
        enrollment_id: params.enrollmentId,
        device_key_hash: deviceKeyHash,
        bound_at: nowIso,
        last_seen_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .maybeSingle()

    if (insertResult.error) {
      if (insertResult.error.code === '23514') {
        return enforceAttendanceDeviceBinding(params)
      }

      if (insertResult.error.code === '23505') {
        const refreshedBindings = await getActiveAttendanceDeviceBindings({
          courseId: params.courseId,
          enrollmentId: params.enrollmentId,
        })

        if (
          refreshedBindings.some((binding) => binding.device_key_hash === deviceKeyHash)
          || refreshedBindings.length !== ownBindings.length
        ) {
          return enforceAttendanceDeviceBinding(params)
        }

        bindingsForPending = refreshedBindings.length > 0 ? refreshedBindings : ownBindings
      } else {
        throw normalizeAttendanceDeviceBindingDependencyError(insertResult.error)
      }
    } else {
      await logAttendanceEvent({
        course_id: params.courseId,
        event_type: 'attendance_device_registered',
        details: {
          enrollment_id: params.enrollmentId,
          registered_count: ownBindings.length + 1,
          device_limit: ATTENDANCE_DEVICE_BINDING_LIMIT,
        },
      })

      const insertedBinding = insertResult.data as AttendanceDeviceBindingRow | null
      return {
        ok: true,
        state: mapAttendanceDeviceStateFromRows(insertedBinding ? [...ownBindings, insertedBinding] : ownBindings),
      }
    }
  }

  const existingPendingBinding = bindingsForPending.find((binding) => binding.reset_requested_device_key_hash === deviceKeyHash) ?? null
  const bindingForPending = existingPendingBinding
    ?? [...bindingsForPending].sort((a, b) => getBindingActivityTimestamp(a) - getBindingActivityTimestamp(b))[0]
  if (!bindingForPending) {
    throw new AttendanceServiceError('등록된 출석 기기를 확인하지 못했습니다.', 409)
  }

  const nextResetRequestedAt = existingPendingBinding
    ? existingPendingBinding.reset_requested_at ?? nowIso
    : nowIso
  const updateResult = await db
    .from('attendance_device_bindings')
    .update({
      reset_requested_at: nextResetRequestedAt,
      reset_requested_device_key_hash: deviceKeyHash,
      reset_requested_user_agent: resetRequestedUserAgent,
      updated_at: nowIso,
    })
    .eq('id', bindingForPending.id)
    .select('*')
    .maybeSingle()

  if (updateResult.error) {
    throw normalizeAttendanceDeviceBindingDependencyError(updateResult.error)
  }

  await logAttendanceEvent({
    course_id: params.courseId,
    event_type: 'attendance_device_rebind_requested',
    details: {
      enrollment_id: params.enrollmentId,
      requested_at: nextResetRequestedAt,
      registered_count: bindingsForPending.length,
      device_limit: ATTENDANCE_DEVICE_BINDING_LIMIT,
    },
  })

  const updatedBinding = updateResult.data as AttendanceDeviceBindingRow | null
  return {
    ok: false,
    code: 'DEVICE_REBIND_REQUIRED',
    state: mapAttendanceDeviceStateFromRows(
      updatedBinding
        ? bindingsForPending.map((binding) => (binding.id === updatedBinding.id ? updatedBinding : binding))
        : bindingsForPending,
    ),
  }
}

export async function approveAttendanceDeviceReRegistration(params: {
  courseId: number
  enrollmentId: number
  actor: string
}) {
  const db = createServerClient()
  const bindings = await getActiveAttendanceDeviceBindings({
    courseId: params.courseId,
    enrollmentId: params.enrollmentId,
  })

  if (bindings.length === 0) {
    throw new AttendanceServiceError('등록된 출석 기기가 없습니다.', 404)
  }

  const binding = bindings
    .filter((row) => row.reset_requested_at && row.reset_requested_device_key_hash)
    .sort((a, b) => getTimestamp(b.reset_requested_at) - getTimestamp(a.reset_requested_at))[0] ?? null
  if (!binding) {
    throw new AttendanceServiceError('승인할 기기 재등록 요청이 없습니다.', 409)
  }

  const requestedDeviceHash = binding.reset_requested_device_key_hash?.trim()
  if (!binding.reset_requested_at || !requestedDeviceHash) {
    throw new AttendanceServiceError('승인할 기기 재등록 요청이 없습니다.', 409)
  }

  const deviceOwnerResult = await db
    .from('attendance_device_bindings')
    .select('id,enrollment_id')
    .eq('course_id', params.courseId)
    .eq('device_key_hash', requestedDeviceHash)
    .eq('is_active', true)
    .neq('enrollment_id', params.enrollmentId)
    .maybeSingle()

  if (deviceOwnerResult.error) {
    throw normalizeAttendanceDeviceBindingDependencyError(deviceOwnerResult.error)
  }

  if (deviceOwnerResult.data) {
    throw new AttendanceServiceError('요청된 기기가 이미 다른 수강생에게 등록되어 있습니다.', 409)
  }

  const nowIso = new Date().toISOString()

  if (bindings.length < ATTENDANCE_DEVICE_BINDING_LIMIT) {
    const insertResult = await db
      .from('attendance_device_bindings')
      .insert({
        course_id: params.courseId,
        enrollment_id: params.enrollmentId,
        device_key_hash: requestedDeviceHash,
        bound_at: nowIso,
        last_seen_at: nowIso,
        reset_approved_at: nowIso,
        reset_approved_by: params.actor,
        updated_at: nowIso,
      })
      .select('*')
      .maybeSingle()

    if (insertResult.error) {
      if (insertResult.error.code === '23505') {
        const refreshedBindings = await getActiveAttendanceDeviceBindings({
          courseId: params.courseId,
          enrollmentId: params.enrollmentId,
        })
        const alreadyRegisteredBinding = refreshedBindings.find((row) => row.device_key_hash === requestedDeviceHash) ?? null

        if (alreadyRegisteredBinding) {
          const clearResult = await db
            .from('attendance_device_bindings')
            .update({
              reset_requested_at: null,
              reset_requested_device_key_hash: null,
              reset_requested_user_agent: null,
              reset_approved_at: nowIso,
              reset_approved_by: params.actor,
              updated_at: nowIso,
            })
            .eq('id', binding.id)
            .select('*')
            .maybeSingle()

          if (clearResult.error) {
            throw normalizeAttendanceDeviceBindingDependencyError(clearResult.error)
          }

          const clearedBinding = clearResult.data as AttendanceDeviceBindingRow | null
          return mapAttendanceDeviceStateFromRows(
            refreshedBindings.map((row) => (row.id === clearedBinding?.id ? clearedBinding : row)),
          )
        }

        throw new AttendanceServiceError('요청된 기기가 이미 다른 수강생에게 등록되어 있습니다.', 409)
      }

      throw normalizeAttendanceDeviceBindingDependencyError(insertResult.error)
    }

    const clearResult = await db
      .from('attendance_device_bindings')
      .update({
        reset_requested_at: null,
        reset_requested_device_key_hash: null,
        reset_requested_user_agent: null,
        reset_approved_at: nowIso,
        reset_approved_by: params.actor,
        updated_at: nowIso,
      })
      .eq('id', binding.id)
      .select('*')
      .maybeSingle()

    if (clearResult.error) {
      throw normalizeAttendanceDeviceBindingDependencyError(clearResult.error)
    }

    await logAttendanceEvent({
      course_id: params.courseId,
      event_type: 'attendance_device_rebind_approved',
      details: {
        actor: params.actor,
        enrollment_id: params.enrollmentId,
        requested_at: binding.reset_requested_at,
        registered_count: bindings.length + 1,
        device_limit: ATTENDANCE_DEVICE_BINDING_LIMIT,
        mode: 'added',
      },
    })

    const insertedBinding = insertResult.data as AttendanceDeviceBindingRow | null
    const clearedBinding = clearResult.data as AttendanceDeviceBindingRow | null
    return mapAttendanceDeviceStateFromRows([
      ...bindings.map((row) => (row.id === clearedBinding?.id ? clearedBinding : row)),
      ...(insertedBinding ? [insertedBinding] : []),
    ])
  }

  const updateResult = await db
    .from('attendance_device_bindings')
    .update({
      device_key_hash: requestedDeviceHash,
      bound_at: nowIso,
      last_seen_at: nowIso,
      reset_requested_at: null,
      reset_requested_device_key_hash: null,
      reset_requested_user_agent: null,
      reset_approved_at: nowIso,
      reset_approved_by: params.actor,
      updated_at: nowIso,
    })
    .eq('id', binding.id)
    .select('*')
    .maybeSingle()

  if (updateResult.error) {
    if (updateResult.error.code === '23505') {
      throw new AttendanceServiceError('요청된 기기가 이미 다른 수강생에게 등록되어 있습니다.', 409)
    }

    throw normalizeAttendanceDeviceBindingDependencyError(updateResult.error)
  }

  await logAttendanceEvent({
    course_id: params.courseId,
    event_type: 'attendance_device_rebind_approved',
    details: {
      actor: params.actor,
      enrollment_id: params.enrollmentId,
      requested_at: binding.reset_requested_at,
      registered_count: bindings.length,
      device_limit: ATTENDANCE_DEVICE_BINDING_LIMIT,
      mode: 'replaced',
    },
  })

  const updatedBinding = updateResult.data as AttendanceDeviceBindingRow | null
  return mapAttendanceDeviceStateFromRows(
    updatedBinding
      ? bindings.map((row) => (row.id === updatedBinding.id ? updatedBinding : row))
      : bindings,
  )
}

export async function resetAttendanceDeviceBinding(params: {
  courseId: number
  enrollmentId: number
  actor: string
  reason?: string | null
}) {
  const bindings = await getActiveAttendanceDeviceBindings({
    courseId: params.courseId,
    enrollmentId: params.enrollmentId,
  })

  if (bindings.length === 0) {
    return mapAttendanceDeviceState(null)
  }

  const db = createServerClient()
  const nowIso = new Date().toISOString()
  const updateResult = await db
    .from('attendance_device_bindings')
    .update({
      is_active: false,
      retired_at: nowIso,
      retired_by: params.actor,
      retirement_reason: params.reason?.trim() || null,
      reset_requested_at: null,
      reset_requested_device_key_hash: null,
      reset_requested_user_agent: null,
      updated_at: nowIso,
    })
    .eq('course_id', params.courseId)
    .eq('enrollment_id', params.enrollmentId)
    .eq('is_active', true)

  if (updateResult.error) {
    throw normalizeAttendanceDeviceBindingDependencyError(updateResult.error)
  }

  await logAttendanceEvent({
    course_id: params.courseId,
    event_type: 'attendance_device_binding_reset',
    details: {
      actor: params.actor,
      enrollment_id: params.enrollmentId,
      reason: params.reason?.trim() || null,
      reset_count: bindings.length,
    },
  })

  return mapAttendanceDeviceState(null)
}

export async function resetCourseAttendanceDeviceBindings(params: {
  courseId: number
  actor: string
  reason?: string | null
}) {
  const db = createServerClient()
  const nowIso = new Date().toISOString()
  const reason = params.reason?.trim() || null
  const updateResult = await db
    .from('attendance_device_bindings')
    .update({
      is_active: false,
      retired_at: nowIso,
      retired_by: params.actor,
      retirement_reason: reason,
      reset_requested_at: null,
      reset_requested_device_key_hash: null,
      reset_requested_user_agent: null,
      updated_at: nowIso,
    })
    .eq('course_id', params.courseId)
    .eq('is_active', true)
    .select('id,enrollment_id')

  if (updateResult.error) {
    throw normalizeAttendanceDeviceBindingDependencyError(updateResult.error)
  }

  const resetCount = updateResult.data?.length ?? 0
  await logAttendanceEvent({
    course_id: params.courseId,
    event_type: 'attendance_device_binding_reset',
    details: {
      actor: params.actor,
      reason,
      scope: 'course',
      reset_count: resetCount,
    },
  })

  return { resetCount }
}

type AttendanceExcuseRecord = {
  id: number
  courseId: number
  enrollmentId: number
  subjectId: number
  excuseDate: string
  reason: string
  createdBy: string
  createdAt: string
  updatedAt: string
  studentName: string
  examNumber: string | null
  phone: string
  subjectName: string
  subjectSortOrder: number | null
}

function mapAttendanceExcuseRow(row: Record<string, unknown>): AttendanceExcuseRecord {
  const enrollment = row.enrollments as Record<string, unknown> | null
  const subject = row.course_subjects as Record<string, unknown> | null

  return {
    id: Number(row.id),
    courseId: Number(row.course_id),
    enrollmentId: Number(row.enrollment_id),
    subjectId: Number(row.subject_id),
    excuseDate: String(row.excuse_date ?? ''),
    reason: String(row.reason ?? ''),
    createdBy: String(row.created_by ?? 'admin'),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    studentName: String(enrollment?.name ?? ''),
    examNumber: enrollment?.exam_number == null ? null : String(enrollment.exam_number),
    phone: String(enrollment?.phone ?? ''),
    subjectName: String(subject?.name ?? ''),
    subjectSortOrder: subject?.sort_order == null ? null : Number(subject.sort_order),
  }
}

function normalizeAttendanceExcuseReason(reason: string) {
  return reason.trim()
}

async function getAttendanceExcuseById(id: number) {
  const db = createServerClient()
  try {
    const row = unwrapSupabaseResult(
      'attendance.excuses.byId',
      await db
        .from('attendance_excuses')
        .select(`
          id,
          course_id,
          enrollment_id,
          subject_id,
          excuse_date,
          reason,
          created_by,
          created_at,
          updated_at,
          enrollments!inner(id,name,exam_number,phone),
          course_subjects!inner(id,name,sort_order)
        `)
        .eq('id', id)
        .maybeSingle(),
    ) as Record<string, unknown> | null

    return row ? mapAttendanceExcuseRow(row) : null
  } catch (error) {
    throw normalizeAttendanceExcuseDependencyError(error)
  }
}

async function getAttendanceExcuseEnrollment(enrollmentId: number) {
  const db = createServerClient()
  const row = unwrapSupabaseResult(
    'attendance.excuses.enrollment',
    await db
      .from('enrollments')
      .select('id,course_id,name,phone,exam_number,created_at,status')
      .eq('id', enrollmentId)
      .maybeSingle(),
  ) as Enrollment | null

  return row
}

async function getAttendanceExcuseSubject(subjectId: number) {
  const db = createServerClient()
  const row = unwrapSupabaseResult(
    'attendance.excuses.subject',
    await db
      .from('course_subjects')
      .select('id,course_id,name,sort_order')
      .eq('id', subjectId)
      .maybeSingle(),
  ) as { id: number; course_id: number; name: string; sort_order: number } | null

  return row
}

async function listActiveEnrollments(courseId: number) {
  const db = createServerClient()
  const rows = unwrapSupabaseResult(
    'attendance.activeEnrollments',
    await db
      .from('enrollments')
      .select('id,course_id,name,phone,exam_number,status,created_at')
      .eq('course_id', courseId)
      .eq('status', 'active')
      .order('created_at'),
  ) as Enrollment[] | null

  return rows ?? []
}

async function listSeatLabelsByEnrollment(courseId: number, subjectId?: number | null) {
  const db = createServerClient()

  if (subjectId != null) {
    const rows = unwrapSupabaseResult(
      'attendance.subjectSeatLabels',
      await db
        .from('seat_assignments')
        .select('enrollment_id,seat_number')
        .eq('subject_id', subjectId),
    ) as Array<{
      enrollment_id: number
      seat_number: string | null
    }> | null

    const seatLabelMap = new Map<number, string>()
    for (const row of rows ?? []) {
      const label = normalizeAttendanceSeatNumber(row.seat_number)
      if (!label) {
        continue
      }

      seatLabelMap.set(Number(row.enrollment_id), label)
    }

    return seatLabelMap
  }

  const rows = unwrapSupabaseResult(
    'attendance.seatLabels',
    await db
      .from('course_seat_reservations')
      .select('enrollment_id,updated_at,course_seats(label)')
      .eq('course_id', courseId)
      .order('updated_at', { ascending: false }),
  ) as Array<{
    enrollment_id: number
    updated_at: string
    course_seats?: { label?: string | null } | null
  }> | null

  const seatLabelMap = new Map<number, string>()
  for (const row of rows ?? []) {
    const enrollmentId = Number(row.enrollment_id)
    if (seatLabelMap.has(enrollmentId)) {
      continue
    }

    const label = row.course_seats?.label
    if (label) {
      seatLabelMap.set(enrollmentId, label)
    }
  }

  return seatLabelMap
}

async function listAttendanceSubjects(courseId: number) {
  const db = createServerClient()
  const rows = unwrapSupabaseResult(
    'attendance.subjects',
    await db
      .from('course_subjects')
      .select('id,name,sort_order')
      .eq('course_id', courseId)
      .order('sort_order')
      .order('id'),
  ) as Array<{ id: number; name: string; sort_order: number }> | null

  return rows ?? []
}

async function listAttendanceDisplaySessionsForDate(courseId: number, targetDate: string) {
  const db = createServerClient()
  const { startIso, endIso } = getKstDateRange(targetDate)
  const rows = unwrapSupabaseResult(
    'attendance.displaySessionsForDate',
    await db
      .from('attendance_display_sessions')
      .select('id,subject_id,created_at,expires_at,revoked_at')
      .eq('course_id', courseId)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: false }),
  ) as Array<{
    id: number
    subject_id: number | null
    created_at: string
    expires_at: string
    revoked_at: string | null
  }> | null

  return rows ?? []
}

function normalizeAttendanceSeatNumber(value: string | null | undefined) {
  const trimmed = (value ?? '').trim()
  if (!trimmed) {
    return null
  }

  return /^-+$/.test(trimmed) ? null : trimmed
}

async function listEligibleSubjectSeatEnrollmentIds(subjectIds: number[]) {
  const uniqueSubjectIds = [...new Set(subjectIds.filter((subjectId) => Number.isInteger(subjectId) && subjectId > 0))]
  if (uniqueSubjectIds.length === 0) {
    return new Map<number, Set<number>>()
  }

  const db = createServerClient()
  const rows = unwrapSupabaseResult(
    'attendance.subjectSeatAssignments',
    await db
      .from('seat_assignments')
      .select('enrollment_id,subject_id,seat_number')
      .in('subject_id', uniqueSubjectIds),
  ) as Array<{
    enrollment_id: number
    subject_id: number
    seat_number: string | null
  }> | null

  const result = new Map<number, Set<number>>()
  for (const subjectId of uniqueSubjectIds) {
    result.set(subjectId, new Set<number>())
  }

  for (const row of rows ?? []) {
    const normalizedSeatNumber = normalizeAttendanceSeatNumber(row.seat_number)
    if (!normalizedSeatNumber) {
      continue
    }

    const subjectId = Number(row.subject_id)
    const enrollmentId = Number(row.enrollment_id)
    if (!result.has(subjectId)) {
      result.set(subjectId, new Set<number>())
    }

    result.get(subjectId)?.add(enrollmentId)
  }

  return result
}

function filterAttendanceEligibleEnrollments(params: {
  enrollments: Enrollment[]
  targetDate: string
  attendanceStartDate?: string | null
  allowedEnrollmentIds?: Set<number> | null
}) {
  return params.enrollments.filter((enrollment) => {
    if (!hasAttendanceStartedForDate(
      params.targetDate,
      getEffectiveAttendanceStartDate(params.attendanceStartDate, enrollment.created_at),
    )) {
      return false
    }

    if (!params.allowedEnrollmentIds) {
      return true
    }

    return params.allowedEnrollmentIds.has(enrollment.id)
  })
}

async function listAttendanceRecordsForCourse(
  courseId: number,
  options?: { attendedDate?: string; subjectId?: number | null },
) {
  const db = createServerClient()
  let query = db
    .from('attendance_records')
    .select('id,course_id,enrollment_id,display_session_id,subject_id,device_key_hash,attended_date,attended_at,created_at')
    .eq('course_id', courseId)
    .order('attended_at', { ascending: false })

  if (options?.attendedDate) {
    query = query.eq('attended_date', options.attendedDate)
  }

  if (options?.subjectId !== undefined) {
    query = options.subjectId == null
      ? query.is('subject_id', null)
      : query.eq('subject_id', options.subjectId)
  }

  const rows = unwrapSupabaseResult(
    'attendance.records',
    await query,
  ) as Array<Record<string, unknown>> | null

  return (rows ?? []).map(mapAttendanceRecordRow)
}

async function getAttendanceRecordForToday(
  courseId: number,
  enrollmentId: number,
  subjectId?: number | null,
) {
  const db = createServerClient()
  let query = db
    .from('attendance_records')
    .select('id,course_id,enrollment_id,display_session_id,subject_id,device_key_hash,attended_date,attended_at,created_at')
    .eq('course_id', courseId)
    .eq('enrollment_id', enrollmentId)
    .eq('attended_date', getAttendanceTodayKey())

  if (subjectId !== undefined) {
    query = subjectId == null
      ? query.is('subject_id', null)
      : query.eq('subject_id', subjectId)
  }

  const row = unwrapSupabaseResult(
    'attendance.recordForToday',
    await query
      .order('attended_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ) as Record<string, unknown> | null

  return row ? mapAttendanceRecordRow(row) : null
}

export async function listAttendanceExcuses(params: {
  courseId: number
  subjectId?: number
  enrollmentId?: number
  fromDate?: string
  toDate?: string
}) {
  const db = createServerClient()
  let query = db
    .from('attendance_excuses')
    .select(`
      id,
      course_id,
      enrollment_id,
      subject_id,
      excuse_date,
      reason,
      created_by,
      created_at,
      updated_at,
      enrollments!inner(id,name,exam_number,phone),
      course_subjects!inner(id,name,sort_order)
    `)
    .eq('course_id', params.courseId)
    .order('excuse_date', { ascending: false })
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })

  if (params.subjectId !== undefined) {
    query = query.eq('subject_id', params.subjectId)
  }

  if (params.enrollmentId !== undefined) {
    query = query.eq('enrollment_id', params.enrollmentId)
  }

  if (params.fromDate) {
    query = query.gte('excuse_date', params.fromDate)
  }

  if (params.toDate) {
    query = query.lte('excuse_date', params.toDate)
  }

  let rows: Array<Record<string, unknown>> | null
  try {
    rows = unwrapSupabaseResult(
      'attendance.excuses.list',
      await query,
  ) as Array<Record<string, unknown>> | null
  } catch (error) {
    if (isMissingAttendanceExcuseDependencyError(error)) {
      return []
    }

    throw error
  }

  return (rows ?? [])
    .map(mapAttendanceExcuseRow)
    .sort((left, right) => (
      right.excuseDate.localeCompare(left.excuseDate)
      || (left.subjectSortOrder ?? Number.MAX_SAFE_INTEGER) - (right.subjectSortOrder ?? Number.MAX_SAFE_INTEGER)
      || left.studentName.localeCompare(right.studentName, 'ko-KR')
    ))
}

export async function createAttendanceExcuse(input: {
  courseId: number
  enrollmentId: number
  subjectId: number
  excuseDate: string
  reason: string
  createdBy: string
}) {
  const normalizedReason = normalizeAttendanceExcuseReason(input.reason)
  if (!normalizedReason) {
    throw new AttendanceServiceError('사유를 입력해 주세요.', 400)
  }

  const [enrollment, subject] = await Promise.all([
    getAttendanceExcuseEnrollment(input.enrollmentId),
    getAttendanceExcuseSubject(input.subjectId),
  ])

  if (!enrollment) {
    throw new AttendanceServiceError('수강생을 찾을 수 없습니다.', 404)
  }

  if (enrollment.course_id !== input.courseId) {
    throw new AttendanceServiceError('다른 강좌의 수강생은 사유서를 등록할 수 없습니다.', 403)
  }

  if (!subject) {
    throw new AttendanceServiceError('과목을 찾을 수 없습니다.', 404)
  }

  if (subject.course_id !== input.courseId) {
    throw new AttendanceServiceError('다른 강좌의 과목에는 사유서를 등록할 수 없습니다.', 403)
  }

  const db = createServerClient()
  const nowIso = new Date().toISOString()
  const insertResult = await db
    .from('attendance_excuses')
    .insert({
      course_id: input.courseId,
      enrollment_id: input.enrollmentId,
      subject_id: input.subjectId,
      excuse_date: input.excuseDate,
      reason: normalizedReason,
      created_by: input.createdBy,
      updated_at: nowIso,
    })
    .select('id,course_id,enrollment_id,subject_id,excuse_date,reason,created_by,created_at,updated_at')
    .single()

  if (insertResult.error) {
    if (insertResult.error.code === '23505') {
      throw new AttendanceServiceError('같은 학생·과목·날짜에는 이미 사유서가 등록되어 있습니다.', 409)
    }

    throw normalizeAttendanceExcuseDependencyError(insertResult.error)
  }

  return {
    id: Number(insertResult.data.id),
    courseId: input.courseId,
    enrollmentId: input.enrollmentId,
    subjectId: input.subjectId,
    excuseDate: String(insertResult.data.excuse_date),
    reason: String(insertResult.data.reason),
    createdBy: String(insertResult.data.created_by ?? input.createdBy),
    createdAt: String(insertResult.data.created_at ?? nowIso),
    updatedAt: String(insertResult.data.updated_at ?? nowIso),
    studentName: enrollment.name,
    examNumber: enrollment.exam_number,
    phone: enrollment.phone,
    subjectName: subject.name,
    subjectSortOrder: subject.sort_order,
  }
}

export async function updateAttendanceExcuse(input: {
  id: number
  courseId: number
  excuseDate: string
  reason: string
}) {
  const existingExcuse = await getAttendanceExcuseById(input.id)
  if (!existingExcuse) {
    throw new AttendanceServiceError('사유서를 찾을 수 없습니다.', 404)
  }

  if (existingExcuse.courseId !== input.courseId) {
    throw new AttendanceServiceError('다른 강좌의 사유서는 수정할 수 없습니다.', 403)
  }

  const normalizedReason = normalizeAttendanceExcuseReason(input.reason)
  if (!normalizedReason) {
    throw new AttendanceServiceError('사유를 입력해 주세요.', 400)
  }

  const db = createServerClient()
  const nowIso = new Date().toISOString()
  const updateResult = await db
    .from('attendance_excuses')
    .update({
      excuse_date: input.excuseDate,
      reason: normalizedReason,
      updated_at: nowIso,
    })
    .eq('id', input.id)
    .select('id,course_id,enrollment_id,subject_id,excuse_date,reason,created_by,created_at,updated_at')
    .single()

  if (updateResult.error) {
    if (updateResult.error.code === '23505') {
      throw new AttendanceServiceError('같은 학생·과목·날짜에는 이미 사유서가 등록되어 있습니다.', 409)
    }

    throw normalizeAttendanceExcuseDependencyError(updateResult.error)
  }

  return {
    ...existingExcuse,
    id: Number(updateResult.data.id),
    excuseDate: String(updateResult.data.excuse_date),
    reason: String(updateResult.data.reason),
    createdBy: String(updateResult.data.created_by ?? existingExcuse.createdBy),
    createdAt: String(updateResult.data.created_at ?? existingExcuse.createdAt),
    updatedAt: String(updateResult.data.updated_at ?? nowIso),
  }
}

export async function deleteAttendanceExcuse(input: {
  id: number
  courseId: number
}) {
  const existingExcuse = await getAttendanceExcuseById(input.id)
  if (!existingExcuse) {
    throw new AttendanceServiceError('사유서를 찾을 수 없습니다.', 404)
  }

  if (existingExcuse.courseId !== input.courseId) {
    throw new AttendanceServiceError('다른 강좌의 사유서는 삭제할 수 없습니다.', 403)
  }

  const db = createServerClient()
  const deleteResult = await db
    .from('attendance_excuses')
    .delete()
    .eq('id', input.id)

  if (deleteResult.error) {
    throw normalizeAttendanceExcuseDependencyError(deleteResult.error)
  }

  return existingExcuse
}

async function listAttendanceSessionDates(
  courseId: number,
  attendanceStartDate?: string | null,
  subjectId?: number | null,
) {
  const db = createServerClient()
  let query = db
    .from('attendance_display_sessions')
    .select('created_at')
    .eq('course_id', courseId)
    .order('created_at')

  if (subjectId !== undefined) {
    query = subjectId == null
      ? query.is('subject_id', null)
      : query.eq('subject_id', subjectId)
  }

  const rows = unwrapSupabaseResult(
    'attendance.sessionDates',
    await query,
  ) as Array<{ created_at: string }> | null

  return Array.from(new Set(
    (rows ?? [])
      .map((row) => getKstDateKey(row.created_at))
      .filter((sessionDate) => hasAttendanceStartedForDate(sessionDate, attendanceStartDate)),
  )).sort((left, right) => left.localeCompare(right))
}

async function getAttendanceAbsenceMetricsLegacy(
  courseId: number,
  enrollments: Array<Pick<Enrollment, 'id' | 'created_at'>>,
  attendanceStartDate?: string | null,
  subjectId?: number | null,
) {
  const result = new Map<number, {
    consecutiveAbsences: number
    lastAttendedDate: string | null
    attendanceStartDate: string | null
  }>()
  for (const enrollment of enrollments) {
    result.set(enrollment.id, {
      consecutiveAbsences: 0,
      lastAttendedDate: null,
      attendanceStartDate: getEffectiveAttendanceStartDate(attendanceStartDate, enrollment.created_at),
    })
  }

  if (enrollments.length === 0) {
    return result
  }

  const db = createServerClient()
  const enrollmentIds = enrollments.map((enrollment) => enrollment.id)
  const attendanceQuery = db
    .from('attendance_records')
    .select('enrollment_id,attended_date')
    .eq('course_id', courseId)
    .in('enrollment_id', enrollmentIds)
    .order('attended_date', { ascending: false })

  const filteredAttendanceQuery = subjectId === undefined
    ? attendanceQuery
    : subjectId == null
      ? attendanceQuery.is('subject_id', null)
      : attendanceQuery.eq('subject_id', subjectId)

  const [sessionDates, attendanceRowsResult] = await Promise.all([
    listAttendanceSessionDates(courseId, attendanceStartDate, subjectId),
    filteredAttendanceQuery,
  ])
  const attendanceRows = unwrapSupabaseResult(
    'attendance.absenceMetrics.records',
    attendanceRowsResult,
  ) as Array<{ enrollment_id: number; attended_date: string }> | null

  if (sessionDates.length === 0) {
    return result
  }

  const sessionDateSet = new Set(sessionDates)
  const enrollmentStartDateMap = new Map(
    enrollments.map((enrollment) => [
      enrollment.id,
      getEffectiveAttendanceStartDate(attendanceStartDate, enrollment.created_at),
    ]),
  )
  const attendanceDateMap = new Map<number, Set<string>>()
  for (const row of attendanceRows ?? []) {
    const enrollmentId = Number(row.enrollment_id)
    if (!attendanceDateMap.has(enrollmentId)) {
      attendanceDateMap.set(enrollmentId, new Set<string>())
    }

    if (sessionDateSet.has(row.attended_date)) {
      attendanceDateMap.get(enrollmentId)?.add(row.attended_date)
    }
  }

  for (const enrollment of enrollments) {
    const enrollmentId = enrollment.id
    const enrollmentAttendanceStartDate = enrollmentStartDateMap.get(enrollmentId) ?? null
    const relevantSessionDates = sessionDates.filter((sessionDate) => (
      hasAttendanceStartedForDate(sessionDate, enrollmentAttendanceStartDate)
    ))
    const attendedDates = attendanceDateMap.get(enrollmentId) ?? new Set<string>()
    const lastAttendedDate = [...relevantSessionDates]
      .reverse()
      .find((sessionDate) => attendedDates.has(sessionDate)) ?? null

    result.set(enrollmentId, {
      consecutiveAbsences: lastAttendedDate === null
        ? relevantSessionDates.length
        : relevantSessionDates.filter((sessionDate) => sessionDate > lastAttendedDate).length,
      lastAttendedDate,
      attendanceStartDate: enrollmentAttendanceStartDate,
    })
  }

  return result
}

async function getAttendanceAbsenceMetrics(
  courseId: number,
  enrollments: Array<Pick<Enrollment, 'id' | 'created_at'>>,
  attendanceStartDate?: string | null,
  subjectId?: number | null,
) {
  const result = new Map<number, {
    consecutiveAbsences: number
    lastAttendedDate: string | null
    attendanceStartDate: string | null
  }>()
  for (const enrollment of enrollments) {
    result.set(enrollment.id, {
      consecutiveAbsences: 0,
      lastAttendedDate: null,
      attendanceStartDate: getEffectiveAttendanceStartDate(attendanceStartDate, enrollment.created_at),
    })
  }

  if (enrollments.length === 0) {
    return result
  }

  const db = createServerClient()
  let rows: Array<{
    enrollment_id: number
    consecutive_absences: number | null
    last_attended_date: string | null
  }> | null
  try {
    rows = unwrapSupabaseResult(
      'attendance.absenceMetrics.rpc',
      await db.rpc('get_attendance_absence_metrics', {
        p_course_id: courseId,
        p_enrollment_ids: enrollments.map((enrollment) => enrollment.id),
        p_subject_id: subjectId ?? null,
      }),
    ) as Array<{
      enrollment_id: number
      consecutive_absences: number | null
      last_attended_date: string | null
    }> | null
  } catch (error) {
    if (!isMissingAttendanceExcuseDependencyError(error)) {
      throw error
    }

    return getAttendanceAbsenceMetricsLegacy(courseId, enrollments, attendanceStartDate, subjectId)
  }

  for (const row of rows ?? []) {
    const existing = result.get(Number(row.enrollment_id))
    if (!existing) {
      continue
    }

    result.set(Number(row.enrollment_id), {
      consecutiveAbsences: Number(row.consecutive_absences ?? 0),
      lastAttendedDate: row.last_attended_date ? String(row.last_attended_date) : null,
      attendanceStartDate: existing.attendanceStartDate,
    })
  }

  return result
}

export async function verifyStudentAttendanceAccess(params: {
  courseId: number
  enrollmentId: number
  name: string
  phone: string
  division: string
}) {
  const db = createServerClient()
  const course = unwrapSupabaseResult(
    'attendance.verifyCourse',
    await db
      .from('courses')
      .select('*')
      .eq('id', params.courseId)
      .eq('division', params.division)
      .eq('status', 'active')
      .maybeSingle(),
  ) as Course | null

  if (!course) {
    return null
  }

  const enrollment = unwrapSupabaseResult(
    'attendance.verifyEnrollment',
    await db
      .from('enrollments')
      .select('*')
      .eq('id', params.enrollmentId)
      .eq('course_id', params.courseId)
      .maybeSingle(),
  ) as Enrollment | null

  if (!enrollment) {
    return null
  }

  if (normalizeName(enrollment.name) !== normalizeName(params.name)) {
    return null
  }

  if (normalizePhone(enrollment.phone) !== normalizePhone(params.phone)) {
    return null
  }

  return { course, enrollment }
}

export async function getActiveAttendanceDisplaySessionForCourse(courseId: number, subjectId?: number) {
  const db = createServerClient()
  let query = db
    .from('attendance_display_sessions')
    .select('*')
    .eq('course_id', courseId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (subjectId !== undefined) {
    query = query.eq('subject_id', subjectId)
  }

  const row = unwrapSupabaseResult(
    'attendance.activeDisplaySessionByCourse',
    await query.maybeSingle(),
  ) as Record<string, unknown> | null

  return row ? mapAttendanceDisplaySessionRow(row) : null
}

export async function getActiveAttendanceDisplaySessionByHash(courseId: number, displayTokenHash: string) {
  const db = createServerClient()
  const row = unwrapSupabaseResult(
    'attendance.activeDisplaySessionByHash',
    await db
      .from('attendance_display_sessions')
      .select('*')
      .eq('course_id', courseId)
      .eq('display_token_hash', displayTokenHash)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
  ) as Record<string, unknown> | null

  return row ? mapAttendanceDisplaySessionRow(row) : null
}

export async function getActiveAttendanceDisplaySessionById(courseId: number, displaySessionId: number) {
  const db = createServerClient()
  const row = unwrapSupabaseResult(
    'attendance.activeDisplaySessionById',
    await db
      .from('attendance_display_sessions')
      .select('*')
      .eq('id', displaySessionId)
      .eq('course_id', courseId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
  ) as Record<string, unknown> | null

  return row ? mapAttendanceDisplaySessionRow(row) : null
}

export async function logAttendanceEvent(input: Omit<AttendanceEvent, 'id' | 'created_at'>) {
  const db = createServerClient()
  try {
    unwrapSupabaseResult(
      'attendance.events.insert',
      await db.from('attendance_events').insert({
        course_id: input.course_id,
        event_type: input.event_type,
        details: input.details ?? {},
      }),
    )
  } catch (error) {
    throw normalizeAttendanceDeviceBindingDependencyError(normalizeAttendanceExcuseDependencyError(error))
  }
}

export async function getAttendanceStudentState(params: {
  course: Course
  enrollmentId: number
}): Promise<AttendanceStudentState> {
  if (!params.course.feature_attendance) {
    return {
      enabled: false,
      open: false,
      attended_today: false,
      attended_at: null,
    }
  }

  if (!hasCourseAttendanceStarted(params.course)) {
    return {
      enabled: true,
      open: false,
      attended_today: false,
      attended_at: null,
    }
  }

  const activeDisplaySession = params.course.attendance_open
    ? await getActiveAttendanceDisplaySessionForCourse(params.course.id)
    : null
  const attendanceRecord = await getAttendanceRecordForToday(
    params.course.id,
    params.enrollmentId,
    activeDisplaySession
      ? activeDisplaySession.subject_id
      : undefined,
  )

  return {
    enabled: true,
    open: Boolean(params.course.attendance_open && activeDisplaySession),
    attended_today: Boolean(attendanceRecord),
    attended_at: attendanceRecord?.attended_at ?? null,
  }
}

export async function getConsecutiveAbsenceMap(
  courseId: number,
  enrollments: Array<Pick<Enrollment, 'id' | 'created_at'>>,
  attendanceStartDate?: string | null,
  subjectId?: number | null,
) {
  const result = new Map<number, number>()
  const metrics = await getAttendanceAbsenceMetrics(courseId, enrollments, attendanceStartDate, subjectId)
  for (const [enrollmentId, metric] of metrics.entries()) {
    result.set(enrollmentId, metric.consecutiveAbsences)
  }

  return result
}

export async function getAttendanceDashboardData(params: {
  courseId: number
  date?: string
  attendanceStartDate?: string | null
  subjectId?: number
}) {
  const targetDate = params.date ?? getAttendanceTodayKey()
  const todayKey = getAttendanceTodayKey()
  const [activeDisplaySession, dateDisplaySessions] = await Promise.all([
    targetDate === todayKey
      ? await getActiveAttendanceDisplaySessionForCourse(
        params.courseId,
        params.subjectId ?? undefined,
      )
      : Promise.resolve(null),
    listAttendanceDisplaySessionsForDate(params.courseId, targetDate),
  ])
  const subjectIdsForDate = [...new Set(
    dateDisplaySessions
      .map((session) => session.subject_id)
      .filter((subjectId): subjectId is number => subjectId != null),
  )]
  const inferredSubjectId = subjectIdsForDate.length === 1
    ? subjectIdsForDate[0]
    : undefined
  const effectiveSubjectId = params.subjectId ?? activeDisplaySession?.subject_id ?? inferredSubjectId
  const attendanceStarted = hasAttendanceStartedForDate(targetDate, params.attendanceStartDate)
  const [enrollments, records, seatLabelMap, subjects, subjectSeatEnrollmentIds, dailyExcuses] = await Promise.all([
    listActiveEnrollments(params.courseId),
    attendanceStarted
      ? listAttendanceRecordsForCourse(params.courseId, {
        attendedDate: targetDate,
        subjectId: effectiveSubjectId,
      })
      : Promise.resolve([] as AttendanceRecord[]),
    listSeatLabelsByEnrollment(params.courseId, effectiveSubjectId),
    listAttendanceSubjects(params.courseId),
    effectiveSubjectId
      ? listEligibleSubjectSeatEnrollmentIds([effectiveSubjectId])
      : Promise.resolve(new Map<number, Set<number>>()),
    attendanceStarted
      ? listAttendanceExcuses({
        courseId: params.courseId,
        fromDate: targetDate,
        toDate: targetDate,
        subjectId: effectiveSubjectId ?? undefined,
      })
      : Promise.resolve([] as AttendanceExcuseRecord[]),
  ])

  const eligibleEnrollments = filterAttendanceEligibleEnrollments({
    enrollments,
    targetDate,
    attendanceStartDate: params.attendanceStartDate,
    allowedEnrollmentIds: effectiveSubjectId
      ? (subjectSeatEnrollmentIds.get(effectiveSubjectId) ?? new Set<number>())
      : null,
  })
  const eligibleEnrollmentIds = new Set(eligibleEnrollments.map((enrollment) => enrollment.id))
  const filteredRecords = records.filter((record) => eligibleEnrollmentIds.has(record.enrollment_id))
  const recordMap = new Map(filteredRecords.map((record) => [record.enrollment_id, record]))
  const enrollmentMap = new Map(eligibleEnrollments.map((enrollment) => [enrollment.id, enrollment]))
  const presentEnrollmentIds = new Set(filteredRecords.map((record) => record.enrollment_id))
  const dailyExcusesByEnrollment = new Map<number, AttendanceExcuseRecord[]>()
  for (const excuse of dailyExcuses) {
    const entries = dailyExcusesByEnrollment.get(excuse.enrollmentId) ?? []
    entries.push(excuse)
    dailyExcusesByEnrollment.set(excuse.enrollmentId, entries)
  }
  const absentEnrollments = attendanceStarted
    ? eligibleEnrollments.filter((enrollment) => !presentEnrollmentIds.has(enrollment.id))
    : []
  const excusedAbsentEnrollmentIds = new Set(
    absentEnrollments
      .filter((enrollment) => dailyExcusesByEnrollment.has(enrollment.id))
      .map((enrollment) => enrollment.id),
  )
  const visibleAbsentEnrollments = absentEnrollments.filter(
    (enrollment) => !excusedAbsentEnrollmentIds.has(enrollment.id),
  )
  const consecutiveAbsenceMap = attendanceStarted
    ? await getConsecutiveAbsenceMap(
      params.courseId,
      absentEnrollments.map((enrollment) => ({
        id: enrollment.id,
        created_at: enrollment.created_at,
      })),
      params.attendanceStartDate,
      effectiveSubjectId,
    )
    : new Map<number, number>()
  const excuseSummaryByEnrollment = new Map<number, {
    excuseId: number | null
    excuseReason: string | null
    excuseSubjectId: number | null
    excuseSubjectName: string | null
  }>()

  for (const [enrollmentId, excuses] of dailyExcusesByEnrollment.entries()) {
    const exactExcuse = effectiveSubjectId != null
      ? excuses.find((excuse) => excuse.subjectId === effectiveSubjectId) ?? null
      : excuses.length === 1
        ? excuses[0]
        : null
    const fallbackExcuse = exactExcuse ?? (excuses.length === 1 ? excuses[0] : null)

    excuseSummaryByEnrollment.set(enrollmentId, {
      excuseId: fallbackExcuse?.id ?? null,
      excuseReason: exactExcuse?.reason
        ?? (excuses.length > 1 ? `사유 ${excuses.length}건 등록` : fallbackExcuse?.reason ?? null),
      excuseSubjectId: fallbackExcuse?.subjectId ?? null,
      excuseSubjectName: fallbackExcuse?.subjectName ?? null,
    })
  }

  const subjectMap = new Map(subjects.map((subject) => [subject.id, subject.name]))
  const nowIso = new Date().toISOString()
  const statusPriority = {
    absent: 0,
    excused: 1,
    present: 2,
  } as const
  const checkedSubjectMap = new Map<string, {
    subjectId: number | null
    subjectName: string
    sessionCount: number
    latestStartedAt: string
    isActive: boolean
  }>()

  for (const session of dateDisplaySessions) {
    const key = session.subject_id == null ? 'none' : String(session.subject_id)
    const current = checkedSubjectMap.get(key)
    const subjectName = session.subject_id == null
      ? '과목 미지정'
      : subjectMap.get(session.subject_id) ?? `과목 #${session.subject_id}`
    const isActive = session.revoked_at == null && session.expires_at > nowIso

    if (!current) {
      checkedSubjectMap.set(key, {
        subjectId: session.subject_id,
        subjectName,
        sessionCount: 1,
        latestStartedAt: session.created_at,
        isActive,
      })
      continue
    }

    current.sessionCount += 1
    if (session.created_at > current.latestStartedAt) {
      current.latestStartedAt = session.created_at
    }
    current.isActive = current.isActive || isActive
  }

  return {
    date: targetDate,
    attendanceStarted,
    attendanceStartDate: params.attendanceStartDate ?? null,
    totalEnrolled: attendanceStarted ? eligibleEnrollments.length : 0,
    presentCount: filteredRecords.length,
    absentCount: attendanceStarted ? visibleAbsentEnrollments.length : 0,
    excusedCount: attendanceStarted ? excusedAbsentEnrollmentIds.size : 0,
    attendanceRate: !attendanceStarted || eligibleEnrollments.length === 0
      ? 0
      : Number(((filteredRecords.length / eligibleEnrollments.length) * 100).toFixed(1)),
    absentees: visibleAbsentEnrollments
      .map((enrollment) => ({
        enrollmentId: enrollment.id,
        studentName: enrollment.name,
        examNumber: enrollment.exam_number,
        phone: enrollment.phone,
        consecutiveAbsences: consecutiveAbsenceMap.get(enrollment.id) ?? 0,
        attendanceStartDate: getEffectiveAttendanceStartDate(params.attendanceStartDate, enrollment.created_at),
        seatLabel: seatLabelMap.get(enrollment.id) ?? null,
      }))
      .sort((left, right) => (
        right.consecutiveAbsences - left.consecutiveAbsences
        || left.studentName.localeCompare(right.studentName, 'ko-KR')
      )),
    targets: eligibleEnrollments
      .map((enrollment) => {
        const record = recordMap.get(enrollment.id) ?? null
        const isPresent = Boolean(record)
        const excuseSummary = excuseSummaryByEnrollment.get(enrollment.id)
        const status = isPresent
          ? 'present'
          : excuseSummary
            ? 'excused'
            : 'absent'

        return {
          enrollmentId: enrollment.id,
          studentName: enrollment.name,
          examNumber: enrollment.exam_number,
          phone: enrollment.phone,
          seatLabel: seatLabelMap.get(enrollment.id) ?? null,
          status,
          attendedAt: record?.attended_at ?? null,
          consecutiveAbsences: isPresent ? 0 : (consecutiveAbsenceMap.get(enrollment.id) ?? 0),
          attendanceStartDate: getEffectiveAttendanceStartDate(params.attendanceStartDate, enrollment.created_at),
          excuseId: excuseSummary?.excuseId ?? null,
          excuseReason: excuseSummary?.excuseReason ?? null,
          excuseSubjectId: excuseSummary?.excuseSubjectId ?? null,
          excuseSubjectName: excuseSummary?.excuseSubjectName ?? null,
        }
      })
      .sort((left, right) => (
        statusPriority[left.status as keyof typeof statusPriority]
        - statusPriority[right.status as keyof typeof statusPriority]
        || right.consecutiveAbsences - left.consecutiveAbsences
        || left.studentName.localeCompare(right.studentName, 'ko-KR')
      )),
    recentRecords: filteredRecords
      .map((record) => {
        const enrollment = enrollmentMap.get(record.enrollment_id)
        if (!enrollment) {
          return null
        }

        return {
          enrollmentId: record.enrollment_id,
          studentName: enrollment.name,
          examNumber: enrollment.exam_number,
          phone: enrollment.phone,
          seatLabel: seatLabelMap.get(record.enrollment_id) ?? null,
          attendedAt: record.attended_at,
        }
      })
      .filter((value): value is {
        enrollmentId: number
        studentName: string
        examNumber: string | null
        phone: string
        seatLabel: string | null
        attendedAt: string
      } => Boolean(value)),
    checkedSubjects: [...checkedSubjectMap.values()].sort((left, right) => (
      right.latestStartedAt.localeCompare(left.latestStartedAt)
      || left.subjectName.localeCompare(right.subjectName, 'ko-KR')
    )),
    displaySession: {
      id: activeDisplaySession?.id ?? null,
      isActive: Boolean(activeDisplaySession),
      expiresAt: activeDisplaySession?.expires_at ?? null,
      subjectId: effectiveSubjectId ?? null,
      subjectName: effectiveSubjectId != null
        ? subjectMap.get(effectiveSubjectId) ?? null
        : null,
    },
  }
}

export async function getAttendanceAbsenceReport(params: {
  courseId: number
  threshold: number
  attendanceStartDate?: string | null
  subjectId?: number | null
}) {
  const attendanceStarted = hasAttendanceStartedForDate(getAttendanceTodayKey(), params.attendanceStartDate)
  if (!attendanceStarted) {
    return {
      threshold: params.threshold,
      flaggedStudents: [],
    }
  }

  const todayKey = getAttendanceTodayKey()
  const [activeDisplaySession, dateDisplaySessions] = await Promise.all([
    params.subjectId === undefined
      ? getActiveAttendanceDisplaySessionForCourse(params.courseId)
      : Promise.resolve(null),
    listAttendanceDisplaySessionsForDate(params.courseId, todayKey),
  ])
  const subjectIdsForDate = [...new Set(
    dateDisplaySessions
      .map((session) => session.subject_id)
      .filter((subjectId): subjectId is number => subjectId != null),
  )]
  const inferredSubjectId = subjectIdsForDate.length === 1
    ? subjectIdsForDate[0]
    : undefined
  const effectiveSubjectId = params.subjectId ?? activeDisplaySession?.subject_id ?? inferredSubjectId

  const [enrollments, seatLabelMap, subjects] = await Promise.all([
    listActiveEnrollments(params.courseId),
    listSeatLabelsByEnrollment(params.courseId, effectiveSubjectId),
    listAttendanceSubjects(params.courseId),
  ])
  const baseEligibleEnrollments = filterAttendanceEligibleEnrollments({
    enrollments,
    targetDate: getAttendanceTodayKey(),
    attendanceStartDate: params.attendanceStartDate,
    allowedEnrollmentIds: null,
  })
  const eligibleSubjectIds = effectiveSubjectId != null
    ? [effectiveSubjectId]
    : subjects.map((subject) => subject.id)
  const subjectSeatEnrollmentIds = await listEligibleSubjectSeatEnrollmentIds(eligibleSubjectIds)

  let flaggedStudents: Array<{
    enrollmentId: number
    studentName: string
    examNumber: string | null
    consecutiveAbsences: number
    lastAttendedDate: string | null
    attendanceStartDate: string | null
    seatLabel: string | null
    subjectId: number | null
    subjectName: string | null
  }> = []

  if (effectiveSubjectId !== undefined) {
    const targetSubject = effectiveSubjectId == null
      ? null
      : subjects.find((subject) => subject.id === effectiveSubjectId) ?? null
    const eligibleEnrollments = targetSubject
      ? filterAttendanceEligibleEnrollments({
        enrollments: baseEligibleEnrollments,
        targetDate: getAttendanceTodayKey(),
        attendanceStartDate: params.attendanceStartDate,
        allowedEnrollmentIds: subjectSeatEnrollmentIds.get(targetSubject.id) ?? new Set<number>(),
      })
      : baseEligibleEnrollments
    const enrollmentMetricTargets = eligibleEnrollments.map((enrollment) => ({
      id: enrollment.id,
      created_at: enrollment.created_at,
    }))
    const absenceMetrics = await getAttendanceAbsenceMetrics(
      params.courseId,
      enrollmentMetricTargets,
      params.attendanceStartDate,
      effectiveSubjectId,
    )

    flaggedStudents = eligibleEnrollments
      .map((enrollment) => ({
        enrollmentId: enrollment.id,
        studentName: enrollment.name,
        examNumber: enrollment.exam_number,
        consecutiveAbsences: absenceMetrics.get(enrollment.id)?.consecutiveAbsences ?? 0,
        lastAttendedDate: absenceMetrics.get(enrollment.id)?.lastAttendedDate ?? null,
        attendanceStartDate: absenceMetrics.get(enrollment.id)?.attendanceStartDate ?? null,
        seatLabel: seatLabelMap.get(enrollment.id) ?? null,
        subjectId: targetSubject?.id ?? null,
        subjectName: targetSubject?.name ?? null,
      }))
      .filter((student) => student.consecutiveAbsences >= params.threshold)
  } else if (subjects.length > 0) {
    const perSubjectMetrics = await Promise.all(subjects.map(async (subject) => ({
      subject,
      eligibleEnrollments: filterAttendanceEligibleEnrollments({
        enrollments: baseEligibleEnrollments,
        targetDate: getAttendanceTodayKey(),
        attendanceStartDate: params.attendanceStartDate,
        allowedEnrollmentIds: subjectSeatEnrollmentIds.get(subject.id) ?? new Set<number>(),
      }),
      metrics: await getAttendanceAbsenceMetrics(
        params.courseId,
        filterAttendanceEligibleEnrollments({
          enrollments: baseEligibleEnrollments,
          targetDate: getAttendanceTodayKey(),
          attendanceStartDate: params.attendanceStartDate,
          allowedEnrollmentIds: subjectSeatEnrollmentIds.get(subject.id) ?? new Set<number>(),
        }).map((enrollment) => ({
          id: enrollment.id,
          created_at: enrollment.created_at,
        })),
        params.attendanceStartDate,
        subject.id,
      ),
    })))

    flaggedStudents = perSubjectMetrics.flatMap(({ subject, metrics, eligibleEnrollments }) => eligibleEnrollments
      .map((enrollment) => ({
        enrollmentId: enrollment.id,
        studentName: enrollment.name,
        examNumber: enrollment.exam_number,
        consecutiveAbsences: metrics.get(enrollment.id)?.consecutiveAbsences ?? 0,
        lastAttendedDate: metrics.get(enrollment.id)?.lastAttendedDate ?? null,
        attendanceStartDate: metrics.get(enrollment.id)?.attendanceStartDate ?? null,
        seatLabel: seatLabelMap.get(enrollment.id) ?? null,
        subjectId: subject.id,
        subjectName: subject.name,
      }))
      .filter((student) => student.consecutiveAbsences >= params.threshold))
  } else {
    const enrollmentMetricTargets = baseEligibleEnrollments.map((enrollment) => ({
      id: enrollment.id,
      created_at: enrollment.created_at,
    }))
    const absenceMetrics = await getAttendanceAbsenceMetrics(
      params.courseId,
      enrollmentMetricTargets,
      params.attendanceStartDate,
    )

    flaggedStudents = baseEligibleEnrollments
      .map((enrollment) => ({
        enrollmentId: enrollment.id,
        studentName: enrollment.name,
        examNumber: enrollment.exam_number,
        consecutiveAbsences: absenceMetrics.get(enrollment.id)?.consecutiveAbsences ?? 0,
        lastAttendedDate: absenceMetrics.get(enrollment.id)?.lastAttendedDate ?? null,
        attendanceStartDate: absenceMetrics.get(enrollment.id)?.attendanceStartDate ?? null,
        seatLabel: seatLabelMap.get(enrollment.id) ?? null,
        subjectId: null,
        subjectName: null,
      }))
      .filter((student) => student.consecutiveAbsences >= params.threshold)
  }

  flaggedStudents.sort((left, right) => (
    right.consecutiveAbsences - left.consecutiveAbsences
    || (left.subjectName ?? '').localeCompare(right.subjectName ?? '', 'ko-KR')
    || left.studentName.localeCompare(right.studentName, 'ko-KR')
  ))

  return {
    threshold: params.threshold,
    flaggedStudents,
  }
}

export async function hasValidSeatAssignmentForSubject(params: {
  enrollmentId: number
  subjectId: number
}) {
  const db = createServerClient()
  const row = unwrapSupabaseResult(
    'attendance.subjectSeatAssignment',
    await db
      .from('seat_assignments')
      .select('seat_number')
      .eq('enrollment_id', params.enrollmentId)
      .eq('subject_id', params.subjectId)
      .maybeSingle(),
  ) as { seat_number?: string | null } | null

  return Boolean(normalizeAttendanceSeatNumber(row?.seat_number ?? null))
}
