import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { normalizeName, normalizePhone } from '@/lib/utils'
import { invalidateCache } from '@/lib/cache/revalidate'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { withDivisionFallback, withStudentStatusFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import {
  findLegacyRefundArchivesByIdentities,
  restoreLegacyRefundArchive,
  type LegacyRefundArchiveSnapshot,
} from '@/lib/students/refund-archive'
import { ACTIVE_STUDENT_STATUS, REFUNDED_STUDENT_STATUS } from '@/lib/student-status'
import { getServerTenantType } from '@/lib/tenant.server'

const rowSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  exam_number: z.string().optional().default(''),
  gender: z.string().optional().default(''),
  region: z.string().optional().default(''),
  series: z.string().optional().default(''),
})

const bulkSchema = z.array(rowSchema).min(1).max(500)

type NormalizedStudentRow = {
  id: string
  name: string
  phone: string
  exam_number: string | null
  gender: string | null
  region: string | null
  series: string | null
}

type ExistingStudent = {
  id: string
  name: string
  phone: string
  status: 'active' | 'refunded'
}

function buildStudentKey(name: string, phone: string) {
  return `${name}\u0000${phone}`
}

function buildNormalizedRow(input: z.infer<typeof rowSchema>): NormalizedStudentRow {
  return {
    id: randomUUID(),
    name: normalizeName(input.name),
    phone: normalizePhone(input.phone),
    exam_number: input.exam_number || null,
    gender: input.gender || null,
    region: input.region || null,
    series: input.series || null,
  }
}

function buildRestorePayload(row: NormalizedStudentRow) {
  return {
    name: row.name,
    phone: row.phone,
    exam_number: row.exam_number,
    gender: row.gender,
    region: row.region,
    series: row.series,
    status: ACTIVE_STUDENT_STATUS,
    refunded_at: null,
    refund_note: null,
    updated_at: new Date().toISOString(),
  }
}

export async function POST(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_student_management_enabled')
  if (featureError) {
    return featureError
  }

  const body = await req.json().catch(() => null)
  const parsed = bulkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  const normalizedRows = parsed.data
    .map(buildNormalizedRow)
    .filter((row) => row.name && row.phone)

  const uniqueRows: NormalizedStudentRow[] = []
  const seenKeys = new Set<string>()
  let duplicateInputCount = 0

  for (const row of normalizedRows) {
    const key = buildStudentKey(row.name, row.phone)
    if (seenKeys.has(key)) {
      duplicateInputCount += 1
      continue
    }

    seenKeys.add(key)
    uniqueRows.push(row)
  }

  const db = createServerClient()
  const division = await getServerTenantType()
  const scope = getScopedDivisionValues(division)
  const uniquePhones = Array.from(new Set(uniqueRows.map((row) => row.phone)))

  const existingResult = uniquePhones.length
    ? await withStudentStatusFallback<{
        data: ExistingStudent[] | null
        error: { code?: string; message?: string; details?: string; hint?: string } | null
      }>(
        () =>
          withDivisionFallback(
            () =>
              db
                .from('students')
                .select('id,name,phone,status')
                .in('division', scope)
                .in('phone', uniquePhones),
            () =>
              db
                .from('students')
                .select('id,name,phone,status')
                .in('phone', uniquePhones),
          ),
        async () => {
          const result = await withDivisionFallback(
            () =>
              db
                .from('students')
                .select('id,name,phone')
                .in('division', scope)
                .in('phone', uniquePhones),
            () =>
              db
                .from('students')
                .select('id,name,phone')
                .in('phone', uniquePhones),
          )

          return {
            data: (result.data ?? []).map((student) => ({
              ...student,
              status: ACTIVE_STUDENT_STATUS,
            })),
            error: result.error,
          }
        },
      )
    : { data: [] as ExistingStudent[], error: null }

  if (existingResult.error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  const existingMap = new Map<string, ExistingStudent>()
  for (const student of (existingResult.data ?? []) as ExistingStudent[]) {
    existingMap.set(buildStudentKey(student.name, student.phone), student)
  }

  const archiveResult = await findLegacyRefundArchivesByIdentities(uniqueRows, division)
  if (archiveResult.error) {
    return NextResponse.json({ error: '?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.' }, { status: 500 })
  }

  const createRows: NormalizedStudentRow[] = []
  const restoreRows: Array<NormalizedStudentRow & { id: string }> = []
  const legacyArchiveRestoreRows: Array<
    NormalizedStudentRow & { archiveKey: string; snapshot: LegacyRefundArchiveSnapshot }
  > = []
  let skipped = duplicateInputCount

  for (const row of uniqueRows) {
    const existing = existingMap.get(buildStudentKey(row.name, row.phone))

    if (!existing) {
      createRows.push(row)
      continue
    }

    if (existing.status === REFUNDED_STUDENT_STATUS) {
      restoreRows.push({ ...row, id: existing.id })
      continue
    }

    skipped += 1
  }

  for (let index = createRows.length - 1; index >= 0; index -= 1) {
    const row = createRows[index]
    const archived = archiveResult.data.get(buildStudentKey(row.name, row.phone))
    if (!archived) {
      continue
    }

    legacyArchiveRestoreRows.push({
      ...row,
      archiveKey: archived.archiveKey,
      snapshot: archived.snapshot,
    })
    createRows.splice(index, 1)
  }

  let created = 0
  if (createRows.length > 0) {
    const { data, error } = await withStudentStatusFallback(
      () =>
        withDivisionFallback(
          () =>
            db
              .from('students')
              .insert(createRows.map((row) => ({ ...row, division, status: ACTIVE_STUDENT_STATUS })))
              .select('id'),
          () =>
            db
              .from('students')
              .insert(createRows.map((row) => ({ ...row, status: ACTIVE_STUDENT_STATUS })))
              .select('id'),
        ),
      () =>
        withDivisionFallback(
          () =>
            db
              .from('students')
              .insert(createRows.map((row) => ({ ...row, division })))
              .select('id'),
          () =>
            db
              .from('students')
              .insert(createRows)
              .select('id'),
        ),
    )

    if (error) {
      return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }

    created = data?.length ?? 0
  }

  let restored = 0
  if (restoreRows.length > 0) {
    const results = await Promise.all(
      restoreRows.map((row) =>
        withDivisionFallback(
          () =>
            db
              .from('students')
              .update(buildRestorePayload(row))
              .eq('id', row.id)
              .in('division', scope)
              .select('id')
              .single(),
          () =>
            db
              .from('students')
              .update(buildRestorePayload(row))
              .eq('id', row.id)
              .select('id')
              .single(),
        ),
      ),
    )

    const failedRestore = results.find((result) => result.error)
    if (failedRestore?.error) {
      return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }

    restored = results.length
  }

  if (legacyArchiveRestoreRows.length > 0) {
    const results = await Promise.all(
      legacyArchiveRestoreRows.map((row) =>
        restoreLegacyRefundArchive(row.archiveKey, row.snapshot, row, division),
      ),
    )

    const failedRestore = results.find((result) => result.error || !result.data)
    if (failedRestore) {
      return NextResponse.json({ error: '?쒕쾭 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎.' }, { status: 500 })
    }

    restored += results.length
  }

  if (created > 0 || restored > 0) {
    await invalidateCache('students')
  }

  return NextResponse.json({
    created,
    restored,
    inserted: created,
    skipped,
    total: normalizedRows.length,
  })
}
