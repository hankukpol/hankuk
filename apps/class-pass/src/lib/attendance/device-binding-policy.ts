import type { AttendanceDeviceState } from '@/types/database'

export const ATTENDANCE_DEVICE_BINDING_LIMIT = 3

export type AttendanceDeviceBindingPolicyRow = {
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

export type AttendanceDeviceBindingDecision =
  | {
    type: 'touch'
    binding: AttendanceDeviceBindingPolicyRow
  }
  | {
    type: 'register'
  }
  | {
    type: 'replace'
    binding: AttendanceDeviceBindingPolicyRow
  }

function normalizeAttendanceDeviceBindingRows(
  rows: AttendanceDeviceBindingPolicyRow | AttendanceDeviceBindingPolicyRow[] | null | undefined,
) {
  if (!rows) {
    return []
  }

  return Array.isArray(rows) ? rows : [rows]
}

function getBindingActivityAt(row: AttendanceDeviceBindingPolicyRow) {
  return row.last_seen_at ?? row.bound_at ?? row.updated_at ?? row.created_at ?? ''
}

function sortBindingsByActivityDesc(rows: AttendanceDeviceBindingPolicyRow[]) {
  return [...rows].sort((left, right) => (
    getBindingActivityAt(right).localeCompare(getBindingActivityAt(left))
    || Number(right.id) - Number(left.id)
  ))
}

function sortBindingsByResetRequestDesc(rows: AttendanceDeviceBindingPolicyRow[]) {
  return [...rows].sort((left, right) => (
    (right.reset_requested_at ?? '').localeCompare(left.reset_requested_at ?? '')
    || Number(right.id) - Number(left.id)
  ))
}

export function hasPendingDeviceRequest(row: AttendanceDeviceBindingPolicyRow) {
  return Boolean(row.reset_requested_at && row.reset_requested_device_key_hash?.trim())
}

export function pickPendingDeviceBinding(rows: AttendanceDeviceBindingPolicyRow[]) {
  return sortBindingsByResetRequestDesc(rows.filter(hasPendingDeviceRequest))[0] ?? null
}

export function shouldPreservePendingDeviceRequest(
  row: AttendanceDeviceBindingPolicyRow,
  deviceKeyHash: string,
) {
  const requestedDeviceHash = row.reset_requested_device_key_hash?.trim()
  return Boolean(row.reset_requested_at && requestedDeviceHash && requestedDeviceHash !== deviceKeyHash)
}

export function pickDeviceBindingForNewRequest(
  rows: AttendanceDeviceBindingPolicyRow[],
  deviceKeyHash: string,
) {
  const pendingSameDevice = rows.find((row) => row.reset_requested_device_key_hash === deviceKeyHash)
  if (pendingSameDevice) {
    return pendingSameDevice
  }

  const sortedByActivity = sortBindingsByActivityDesc(rows)
  return pickPendingDeviceBinding(rows) ?? sortedByActivity[sortedByActivity.length - 1] ?? rows[0] ?? null
}

export function mapAttendanceDeviceState(
  bindings: AttendanceDeviceBindingPolicyRow | AttendanceDeviceBindingPolicyRow[] | null | undefined,
): AttendanceDeviceState {
  const rows = normalizeAttendanceDeviceBindingRows(bindings).filter((row) => row.is_active)

  if (rows.length === 0) {
    return {
      status: 'unregistered',
      registered_count: 0,
      max_registered_count: ATTENDANCE_DEVICE_BINDING_LIMIT,
      bound_at: null,
      last_seen_at: null,
      reset_requested_at: null,
      reset_requested_user_agent: null,
    }
  }

  const latestBinding = sortBindingsByActivityDesc(rows)[0] ?? rows[0]
  const pendingBinding = pickPendingDeviceBinding(rows)

  return {
    status: pendingBinding ? 'pending_reset' : 'active',
    registered_count: rows.length,
    max_registered_count: ATTENDANCE_DEVICE_BINDING_LIMIT,
    bound_at: latestBinding.bound_at ?? null,
    last_seen_at: latestBinding.last_seen_at ?? null,
    reset_requested_at: pendingBinding?.reset_requested_at ?? null,
    reset_requested_user_agent: pendingBinding?.reset_requested_user_agent ?? null,
  }
}

export function getAttendanceDeviceBindingDecision(
  bindings: AttendanceDeviceBindingPolicyRow[],
  deviceKeyHash: string,
): AttendanceDeviceBindingDecision {
  const rows = bindings.filter((row) => row.is_active)
  const matchingBinding = rows.find((row) => row.device_key_hash === deviceKeyHash) ?? null

  if (matchingBinding) {
    return {
      type: 'touch',
      binding: matchingBinding,
    }
  }

  if (rows.length < ATTENDANCE_DEVICE_BINDING_LIMIT) {
    return {
      type: 'register',
    }
  }

  const binding = pickDeviceBindingForNewRequest(rows, deviceKeyHash)
  if (!binding) {
    return {
      type: 'register',
    }
  }

  return {
    type: 'replace',
    binding,
  }
}

export function isDeviceBindingConflictError(error: { code?: string | null } | null | undefined) {
  return error?.code === '23505' || error?.code === '23514'
}
