import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { createServerClient } from '@/lib/supabase/server'

type DbClient = ReturnType<typeof createServerClient>

export type SeatAssignmentAbsenceState = {
  enrollment_id: number
  subject_id: number
  absence_reset_at: string | null
  pending_reassignment_reset: boolean
  updated_at: string
}

type SeatAssignmentPair = {
  enrollmentId: number
  subjectId: number
}

function mapSeatAssignmentAbsenceStateRow(row: Record<string, unknown>): SeatAssignmentAbsenceState {
  return {
    enrollment_id: Number(row.enrollment_id),
    subject_id: Number(row.subject_id),
    absence_reset_at: row.absence_reset_at ? String(row.absence_reset_at) : null,
    pending_reassignment_reset: Boolean(row.pending_reassignment_reset),
    updated_at: String(row.updated_at ?? ''),
  }
}

export function getSeatAssignmentAbsenceStateKey(enrollmentId: number, subjectId: number) {
  return `${enrollmentId}:${subjectId}`
}

export function buildSeatAssignmentAbsenceResetMap(states: SeatAssignmentAbsenceState[]) {
  const map = new Map<string, string>()

  for (const state of states) {
    if (!state.absence_reset_at) {
      continue
    }

    map.set(getSeatAssignmentAbsenceStateKey(state.enrollment_id, state.subject_id), state.absence_reset_at)
  }

  return map
}

export async function getSeatAssignmentAbsenceState(
  db: DbClient,
  pair: SeatAssignmentPair,
): Promise<SeatAssignmentAbsenceState | null> {
  const row = unwrapSupabaseResult(
    'seatAssignmentAbsenceState.single',
    await db
      .from('seat_assignment_absence_states')
      .select('enrollment_id,subject_id,absence_reset_at,pending_reassignment_reset,updated_at')
      .eq('enrollment_id', pair.enrollmentId)
      .eq('subject_id', pair.subjectId)
      .maybeSingle(),
  ) as Record<string, unknown> | null

  return row ? mapSeatAssignmentAbsenceStateRow(row) : null
}

export async function listSeatAssignmentAbsenceStates(
  db: DbClient,
  params: {
    subjectIds: number[]
    enrollmentIds?: number[]
  },
): Promise<SeatAssignmentAbsenceState[]> {
  if (params.subjectIds.length === 0) {
    return []
  }

  if (params.enrollmentIds && params.enrollmentIds.length === 0) {
    return []
  }

  let query = db
    .from('seat_assignment_absence_states')
    .select('enrollment_id,subject_id,absence_reset_at,pending_reassignment_reset,updated_at')
    .in('subject_id', params.subjectIds)

  if (params.enrollmentIds && params.enrollmentIds.length > 0) {
    query = query.in('enrollment_id', params.enrollmentIds)
  }

  const rows = unwrapSupabaseResult(
    'seatAssignmentAbsenceState.list',
    await query,
  ) as Array<Record<string, unknown>> | null

  return (rows ?? []).map(mapSeatAssignmentAbsenceStateRow)
}

export async function markSeatAssignmentPendingReset(
  db: DbClient,
  pair: SeatAssignmentPair,
) {
  const nowIso = new Date().toISOString()
  const { data: updated, error: updateError } = await db
    .from('seat_assignment_absence_states')
    .update({
      pending_reassignment_reset: true,
      updated_at: nowIso,
    })
    .eq('enrollment_id', pair.enrollmentId)
    .eq('subject_id', pair.subjectId)
    .select('enrollment_id,subject_id,absence_reset_at,pending_reassignment_reset,updated_at')
    .maybeSingle()

  if (updateError) {
    throw updateError
  }

  if (updated) {
    return mapSeatAssignmentAbsenceStateRow(updated as Record<string, unknown>)
  }

  const { data: inserted, error: insertError } = await db
    .from('seat_assignment_absence_states')
    .insert({
      enrollment_id: pair.enrollmentId,
      subject_id: pair.subjectId,
      pending_reassignment_reset: true,
      updated_at: nowIso,
    })
    .select('enrollment_id,subject_id,absence_reset_at,pending_reassignment_reset,updated_at')
    .maybeSingle()

  if (insertError) {
    throw insertError
  }

  return inserted ? mapSeatAssignmentAbsenceStateRow(inserted as Record<string, unknown>) : null
}

export async function consumePendingSeatAssignmentReset(
  db: DbClient,
  pair: SeatAssignmentPair,
  currentState?: SeatAssignmentAbsenceState | null,
) {
  const state = currentState ?? await getSeatAssignmentAbsenceState(db, pair)
  if (!state?.pending_reassignment_reset) {
    return null
  }

  const nowIso = new Date().toISOString()
  const { data, error } = await db
    .from('seat_assignment_absence_states')
    .upsert(
      {
        enrollment_id: pair.enrollmentId,
        subject_id: pair.subjectId,
        absence_reset_at: nowIso,
        pending_reassignment_reset: false,
        updated_at: nowIso,
      },
      { onConflict: 'enrollment_id,subject_id', ignoreDuplicates: false },
    )
    .select('enrollment_id,subject_id,absence_reset_at,pending_reassignment_reset,updated_at')
    .maybeSingle()

  if (error) {
    throw error
  }

  return data ? mapSeatAssignmentAbsenceStateRow(data as Record<string, unknown>) : null
}

export async function consumePendingSeatAssignmentResets(
  db: DbClient,
  pairs: SeatAssignmentPair[],
) {
  if (pairs.length === 0) {
    return 0
  }

  const uniquePairs = Array.from(
    new Map(
      pairs.map((pair) => [
        getSeatAssignmentAbsenceStateKey(pair.enrollmentId, pair.subjectId),
        pair,
      ]),
    ).values(),
  )

  const states = await listSeatAssignmentAbsenceStates(db, {
    subjectIds: [...new Set(uniquePairs.map((pair) => pair.subjectId))],
    enrollmentIds: [...new Set(uniquePairs.map((pair) => pair.enrollmentId))],
  })
  const stateMap = new Map(
    states.map((state) => [
      getSeatAssignmentAbsenceStateKey(state.enrollment_id, state.subject_id),
      state,
    ]),
  )

  const pendingPairs = uniquePairs.filter((pair) => {
    const state = stateMap.get(getSeatAssignmentAbsenceStateKey(pair.enrollmentId, pair.subjectId))
    return Boolean(state?.pending_reassignment_reset)
  })

  if (pendingPairs.length === 0) {
    return 0
  }

  const nowIso = new Date().toISOString()
  const { error } = await db
    .from('seat_assignment_absence_states')
    .upsert(
      pendingPairs.map((pair) => ({
        enrollment_id: pair.enrollmentId,
        subject_id: pair.subjectId,
        absence_reset_at: nowIso,
        pending_reassignment_reset: false,
        updated_at: nowIso,
      })),
      { onConflict: 'enrollment_id,subject_id', ignoreDuplicates: false },
    )

  if (error) {
    throw error
  }

  return pendingPairs.length
}
