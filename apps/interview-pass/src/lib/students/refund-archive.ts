import { createServerClient } from '@/lib/supabase/server'
import { withDivisionFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import type { TenantType } from '@/lib/tenant'
import { normalizeName, normalizePhone } from '@/lib/utils'
import type { SupabaseErrorLike } from '@/lib/students/remove'

const REFUND_ARCHIVE_PREFIX = 'student_refund_archive'
const REFUND_ARCHIVE_DESCRIPTION = 'Legacy refund archive for student restore'

type ArchiveStudentRow = Record<string, unknown>
type ArchiveLogRow = Record<string, unknown>

export type LegacyRefundArchiveSnapshot = {
  version: 1
  division: TenantType
  archived_at: string
  refund_note: string | null
  restored_at: string | null
  restored_student_id: string | null
  student: ArchiveStudentRow
  distribution_logs: ArchiveLogRow[]
}

type StudentRegistrationPayload = {
  id: string
  name: string
  phone: string
  exam_number: string | null
  gender: string | null
  region: string | null
  series: string | null
}

type ConfigRow = {
  config_key: string
  config_value: unknown
}

function buildIdentityToken(name: string, phone: string) {
  return Buffer.from(`${normalizeName(name)}\u0000${normalizePhone(phone)}`, 'utf8').toString('base64url')
}

export function buildLegacyRefundArchiveKey(division: TenantType, name: string, phone: string) {
  return `${REFUND_ARCHIVE_PREFIX}::${division}::${buildIdentityToken(name, phone)}`
}

function isArchiveSnapshot(value: unknown): value is LegacyRefundArchiveSnapshot {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<LegacyRefundArchiveSnapshot>
  return candidate.version === 1 && Boolean(candidate.student) && Array.isArray(candidate.distribution_logs)
}

function withoutDivision<T extends Record<string, unknown>>(row: T) {
  const rest = { ...row }
  delete rest.division
  return rest
}

function withoutDivisionFromRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => withoutDivision(row))
}

function buildStudentRowForRestore(
  snapshot: LegacyRefundArchiveSnapshot,
  payload: StudentRegistrationPayload,
  division: TenantType,
) {
  const archivedStudent = snapshot.student
  const base = { ...archivedStudent }
  delete base.status
  delete base.refunded_at
  delete base.refund_note

  return {
    ...base,
    id: typeof archivedStudent.id === 'string' ? archivedStudent.id : payload.id,
    division: typeof archivedStudent.division === 'string' ? archivedStudent.division : division,
    name: payload.name,
    phone: payload.phone,
    exam_number: payload.exam_number,
    gender: payload.gender,
    region: payload.region,
    series: payload.series,
    updated_at: new Date().toISOString(),
  } as Record<string, unknown>
}

function buildDistributionLogsForRestore(
  snapshot: LegacyRefundArchiveSnapshot,
  studentId: string,
  division: TenantType,
) {
  return snapshot.distribution_logs.map((log) => {
    const rest = { ...log }
    delete rest.id
    delete rest.student_id

    return {
      ...rest,
      student_id: studentId,
      division: typeof log.division === 'string' ? log.division : division,
    }
  })
}

async function markArchiveRestored(
  archiveKey: string,
  snapshot: LegacyRefundArchiveSnapshot,
  studentId: string,
) {
  const db = createServerClient()
  const nextSnapshot: LegacyRefundArchiveSnapshot = {
    ...snapshot,
    restored_at: new Date().toISOString(),
    restored_student_id: studentId,
  }

  const { error } = await db.from('app_config').upsert({
    config_key: archiveKey,
    config_value: nextSnapshot,
    description: REFUND_ARCHIVE_DESCRIPTION,
    updated_at: new Date().toISOString(),
  })

  return error ?? null
}

export async function saveLegacyRefundArchive(
  studentId: string,
  division: TenantType,
  refundNote: string | null,
) {
  const db = createServerClient()
  const scope = getScopedDivisionValues(division)

  const { data: student, error: studentError } = await withDivisionFallback(
    () =>
      db
        .from('students')
        .select('*')
        .eq('id', studentId)
        .in('division', scope)
        .maybeSingle(),
    () =>
      db
        .from('students')
        .select('*')
        .eq('id', studentId)
        .maybeSingle(),
  )

  if (studentError) {
    return { error: studentError as SupabaseErrorLike }
  }

  if (!student) {
    return {
      error: {
        code: 'STUDENT_NOT_FOUND',
        message: 'Student not found while creating refund archive.',
      } as SupabaseErrorLike,
    }
  }

  const { data: logs, error: logsError } = await withDivisionFallback(
    () =>
      db
        .from('distribution_logs')
        .select('*')
        .eq('student_id', studentId)
        .in('division', scope),
    () =>
      db
        .from('distribution_logs')
        .select('*')
        .eq('student_id', studentId),
  )

  if (logsError) {
    return { error: logsError as SupabaseErrorLike }
  }

  const archiveKey = buildLegacyRefundArchiveKey(
    division,
    String(student.name ?? ''),
    String(student.phone ?? ''),
  )

  const snapshot: LegacyRefundArchiveSnapshot = {
    version: 1,
    division,
    archived_at: new Date().toISOString(),
    refund_note: refundNote,
    restored_at: null,
    restored_student_id: null,
    student: student as ArchiveStudentRow,
    distribution_logs: (logs ?? []) as ArchiveLogRow[],
  }

  const { error } = await db.from('app_config').upsert({
    config_key: archiveKey,
    config_value: snapshot,
    description: REFUND_ARCHIVE_DESCRIPTION,
    updated_at: new Date().toISOString(),
  })

  return {
    error: (error ?? null) as SupabaseErrorLike,
    archiveKey,
    archivedLogCount: snapshot.distribution_logs.length,
  }
}

export async function findLegacyRefundArchiveByIdentity(
  name: string,
  phone: string,
  division: TenantType,
) {
  const db = createServerClient()
  const archiveKey = buildLegacyRefundArchiveKey(division, name, phone)
  const { data, error } = await db
    .from('app_config')
    .select('config_key, config_value')
    .eq('config_key', archiveKey)
    .maybeSingle<ConfigRow>()

  if (error) {
    return { data: null, error: error as SupabaseErrorLike }
  }

  if (!isArchiveSnapshot(data?.config_value) || data.config_value.restored_at) {
    return { data: null, error: null as SupabaseErrorLike }
  }

  return {
    data: {
      archiveKey,
      snapshot: data.config_value,
    },
    error: null as SupabaseErrorLike,
  }
}

export async function findLegacyRefundArchivesByIdentities(
  rows: Array<{ name: string; phone: string }>,
  division: TenantType,
) {
  if (rows.length === 0) {
    return { data: new Map<string, { archiveKey: string; snapshot: LegacyRefundArchiveSnapshot }>(), error: null as SupabaseErrorLike }
  }

  const db = createServerClient()
  const keys = Array.from(
    new Set(rows.map((row) => buildLegacyRefundArchiveKey(division, row.name, row.phone))),
  )

  const { data, error } = await db
    .from('app_config')
    .select('config_key, config_value')
    .in('config_key', keys)

  if (error) {
    return {
      data: new Map<string, { archiveKey: string; snapshot: LegacyRefundArchiveSnapshot }>(),
      error: error as SupabaseErrorLike,
    }
  }

  const archiveMap = new Map<string, { archiveKey: string; snapshot: LegacyRefundArchiveSnapshot }>()

  for (const row of (data ?? []) as ConfigRow[]) {
    if (!isArchiveSnapshot(row.config_value) || row.config_value.restored_at) {
      continue
    }

    const identityKey = `${normalizeName(String(row.config_value.student.name ?? ''))}\u0000${normalizePhone(String(row.config_value.student.phone ?? ''))}`
    archiveMap.set(identityKey, {
      archiveKey: row.config_key,
      snapshot: row.config_value,
    })
  }

  return { data: archiveMap, error: null as SupabaseErrorLike }
}

export async function restoreLegacyRefundArchive(
  archiveKey: string,
  snapshot: LegacyRefundArchiveSnapshot,
  payload: StudentRegistrationPayload,
  division: TenantType,
) {
  const db = createServerClient()
  const studentRow = buildStudentRowForRestore(snapshot, payload, division)

  const { data: restoredStudent, error: studentError } = await withDivisionFallback(
    () =>
      db
        .from('students')
        .insert(studentRow)
        .select()
        .single(),
    () =>
      db
        .from('students')
        .insert(withoutDivision(studentRow))
        .select()
        .single(),
  )

  if (studentError) {
    return { data: null, error: studentError as SupabaseErrorLike }
  }

  const restoredStudentId = String(restoredStudent.id)
  const distributionLogs = buildDistributionLogsForRestore(snapshot, restoredStudentId, division)

  if (distributionLogs.length > 0) {
    const { error: logsError } = await withDivisionFallback(
      () =>
        db
          .from('distribution_logs')
          .insert(distributionLogs),
      () =>
        db
          .from('distribution_logs')
          .insert(withoutDivisionFromRows(distributionLogs)),
    )

    if (logsError) {
      await withDivisionFallback(
        () =>
          db
            .from('students')
            .delete()
            .eq('id', restoredStudentId)
            .in('division', getScopedDivisionValues(division)),
        () =>
          db
            .from('students')
            .delete()
            .eq('id', restoredStudentId),
      )

      return { data: null, error: logsError as SupabaseErrorLike }
    }
  }

  const archiveError = await markArchiveRestored(archiveKey, snapshot, restoredStudentId)
  if (archiveError) {
    console.error('[students:refund-archive] failed to mark archive as restored', {
      archiveKey,
      studentId: restoredStudentId,
      code: archiveError.code,
      message: archiveError.message,
      details: archiveError.details,
      hint: archiveError.hint,
    })
  }

  return {
    data: {
      student: restoredStudent,
      restoredMaterials: distributionLogs.length,
    },
    error: null as SupabaseErrorLike,
  }
}
