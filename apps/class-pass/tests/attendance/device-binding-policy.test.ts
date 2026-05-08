import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ATTENDANCE_DEVICE_BINDING_LIMIT,
  getAttendanceDeviceBindingDecision,
  isDeviceBindingConflictError,
  mapAttendanceDeviceState,
  pickDeviceBindingForNewRequest,
  pickPendingDeviceBinding,
  shouldPreservePendingDeviceRequest,
  type AttendanceDeviceBindingPolicyRow,
} from '../../src/lib/attendance/device-binding-policy'

function row(overrides: Partial<AttendanceDeviceBindingPolicyRow> = {}): AttendanceDeviceBindingPolicyRow {
  const id = overrides.id ?? 1
  return {
    id,
    course_id: 10,
    enrollment_id: 20,
    device_key_hash: `hash-${id}`,
    is_active: true,
    bound_at: `2026-04-30T10:0${id}:00.000Z`,
    last_seen_at: null,
    reset_requested_at: null,
    reset_requested_device_key_hash: null,
    reset_requested_user_agent: null,
    reset_approved_at: null,
    reset_approved_by: null,
    retired_at: null,
    retired_by: null,
    retirement_reason: null,
    created_at: `2026-04-30T10:0${id}:00.000Z`,
    updated_at: `2026-04-30T10:0${id}:00.000Z`,
    ...overrides,
  }
}

describe('attendance device binding policy', () => {
  it('maps empty bindings to an unregistered state', () => {
    assert.deepEqual(mapAttendanceDeviceState([]), {
      status: 'unregistered',
      registered_count: 0,
      max_registered_count: ATTENDANCE_DEVICE_BINDING_LIMIT,
      bound_at: null,
      last_seen_at: null,
      reset_requested_at: null,
      reset_requested_user_agent: null,
    })
  })

  it('maps active bindings with the latest activity and pending request metadata', () => {
    const state = mapAttendanceDeviceState([
      row({ id: 1, last_seen_at: '2026-04-30T10:01:00.000Z' }),
      row({
        id: 2,
        last_seen_at: '2026-04-30T10:03:00.000Z',
        reset_requested_at: '2026-04-30T10:04:00.000Z',
        reset_requested_device_key_hash: 'new-hash',
        reset_requested_user_agent: 'Safari',
      }),
      row({ id: 3, last_seen_at: '2026-04-30T10:02:00.000Z' }),
    ])

    assert.equal(state.status, 'pending_reset')
    assert.equal(state.registered_count, 3)
    assert.equal(state.last_seen_at, '2026-04-30T10:03:00.000Z')
    assert.equal(state.reset_requested_at, '2026-04-30T10:04:00.000Z')
    assert.equal(state.reset_requested_user_agent, 'Safari')
  })

  it('picks the pending request for the same requested device first', () => {
    const bindings = [
      row({
        id: 1,
        reset_requested_at: '2026-04-30T10:05:00.000Z',
        reset_requested_device_key_hash: 'other-hash',
      }),
      row({
        id: 2,
        reset_requested_at: '2026-04-30T10:04:00.000Z',
        reset_requested_device_key_hash: 'target-hash',
      }),
      row({ id: 3 }),
    ]

    assert.equal(pickDeviceBindingForNewRequest(bindings, 'target-hash')?.id, 2)
  })

  it('picks the latest pending request when there is no same-device pending request', () => {
    const bindings = [
      row({
        id: 1,
        reset_requested_at: '2026-04-30T10:05:00.000Z',
        reset_requested_device_key_hash: 'pending-a',
      }),
      row({
        id: 2,
        reset_requested_at: '2026-04-30T10:06:00.000Z',
        reset_requested_device_key_hash: 'pending-b',
      }),
      row({ id: 3 }),
    ]

    assert.equal(pickPendingDeviceBinding(bindings)?.id, 2)
    assert.equal(pickDeviceBindingForNewRequest(bindings, 'new-hash')?.id, 2)
    assert.equal(shouldPreservePendingDeviceRequest(bindings[1], 'new-hash'), true)
  })

  it('picks the oldest active binding when a fourth device needs admin approval', () => {
    const bindings = [
      row({ id: 1, last_seen_at: '2026-04-30T10:01:00.000Z' }),
      row({ id: 2, last_seen_at: '2026-04-30T10:03:00.000Z' }),
      row({ id: 3, last_seen_at: '2026-04-30T10:02:00.000Z' }),
    ]

    assert.equal(pickDeviceBindingForNewRequest(bindings, 'new-hash')?.id, 1)
  })

  it('preserves an existing pending request when a different new device retries', () => {
    const pending = row({
      reset_requested_at: '2026-04-30T10:05:00.000Z',
      reset_requested_device_key_hash: 'pending-hash',
    })
    const decision = getAttendanceDeviceBindingDecision([
      pending,
      row({ id: 2 }),
      row({ id: 3 }),
    ], 'another-hash')

    assert.equal(shouldPreservePendingDeviceRequest(pending, 'another-hash'), true)
    assert.equal(shouldPreservePendingDeviceRequest(pending, 'pending-hash'), false)
    assert.equal(shouldPreservePendingDeviceRequest(row(), 'another-hash'), false)
    assert.equal(decision.type, 'request_rebind')
    if (decision.type === 'request_rebind') {
      assert.equal(decision.binding.id, pending.id)
    }
  })

  it('decides whether to touch, register, or request rebind', () => {
    assert.equal(getAttendanceDeviceBindingDecision([], 'new-hash').type, 'register')
    assert.equal(
      getAttendanceDeviceBindingDecision([row({ id: 1 }), row({ id: 2 })], 'new-hash').type,
      'register',
    )

    const touch = getAttendanceDeviceBindingDecision([row({ id: 1, device_key_hash: 'known' })], 'known')
    assert.equal(touch.type, 'touch')

    const requestRebind = getAttendanceDeviceBindingDecision(
      [row({ id: 1 }), row({ id: 2 }), row({ id: 3 })],
      'new-hash',
    )
    assert.equal(requestRebind.type, 'request_rebind')
  })

  it('recognizes database uniqueness and limit conflicts', () => {
    assert.equal(isDeviceBindingConflictError({ code: '23505' }), true)
    assert.equal(isDeviceBindingConflictError({ code: '23514' }), true)
    assert.equal(isDeviceBindingConflictError({ code: 'PGRST116' }), false)
    assert.equal(isDeviceBindingConflictError(null), false)
  })
})
