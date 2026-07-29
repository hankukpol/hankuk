import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import {
  findBranchSeriesOptionByLabel,
  listBranchSeriesOptions,
  resolveBranchSeriesOptionFromOptions,
} from '@/lib/branch-series'
import { parseEnrollmentBulkText, type ParsedEnrollmentRow } from '@/lib/bulk'
import { invalidateCache } from '@/lib/cache/revalidate'
import {
  getBulkImportEnrollmentSnapshotMismatches,
  normalizeBulkImportEditableRow,
  type BulkImportEditableRow,
  type BulkImportMasterSnapshot,
  type BulkImportRowIssue,
} from '@/lib/enrollment-bulk-workflow'
import { normalizeCohortNumber, resolveStudentCohortOptionByNumber } from '@/lib/student-cohorts'
import {
  ensureStudentProfilesBatch,
  initializeStudentAuthBatch,
  inspectStudentProfilesBatch,
  isStudentIdentityConflictError,
  syncStudentEnrollmentSnapshotsBatch,
  type EnsureStudentProfileResult,
} from '@/lib/student-profiles'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { normalizeExamNumber, normalizeName, normalizePhone } from '@/lib/utils'
import type { EnrollmentFieldDef, Student } from '@/types/database'

const retryRowSchema = z.object({
  sourceLineNumber: z.number().int().positive(),
  sourceText: z.string().default(''),
  name: z.string(),
  phone: z.string(),
  examNumber: z.string().default(''),
  cohortLabel: z.string().default(''),
  birthDate: z.string().default(''),
  gender: z.string().default(''),
  series: z.string().default(''),
  memo: z.string().default(''),
  photoUrl: z.string().default(''),
  customData: z.record(z.string()).default({}),
})

const schema = z.object({
  courseId: z.number().int().positive(),
  text: z.string().optional(),
  rows: z.array(retryRowSchema).optional(),
}).superRefine((value, context) => {
  if (!value.text?.trim() && (!value.rows || value.rows.length === 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'text 또는 rows가 필요합니다.',
    })
  }
})

type ExistingEnrollmentRow = {
  id: number
  course_id: number
  student_id: number | null
  name: string
  phone: string
  exam_number: string | null
  gender: string | null
  region: string | null
  series_option_id: number | null
  series_group: 'public' | 'career' | null
  series: string | null
  status: 'active' | 'refunded'
  photo_url: string | null
  memo: string | null
  refunded_at: string | null
  custom_data: Record<string, string>
  created_at: string
}

function findExistingEnrollmentForImportedRow(
  row: ParsedEnrollmentRow,
  existingByExamNumber: Map<string, ExistingEnrollmentRow>,
) {
  const examNumber = normalizeExamNumber(row.exam_number)
  return examNumber ? existingByExamNumber.get(examNumber) ?? null : null
}

function toEditableRow(row: ParsedEnrollmentRow): BulkImportEditableRow {
  return {
    sourceLineNumber: row.sourceLineNumber,
    sourceText: row.sourceText,
    name: row.name,
    phone: row.phone,
    examNumber: row.exam_number ?? '',
    cohortLabel: row.cohort_label ?? '',
    birthDate: row.birth_date ?? '',
    gender: row.gender ?? '',
    series: row.series ?? '',
    memo: row.memo ?? '',
    photoUrl: row.photo_url ?? '',
    customData: row.custom_data ?? {},
  }
}

function fromEditableRow(row: BulkImportEditableRow): ParsedEnrollmentRow {
  const normalized = normalizeBulkImportEditableRow(row)
  return {
    sourceLineNumber: normalized.sourceLineNumber,
    sourceText: normalized.sourceText,
    name: normalized.name,
    phone: normalized.phone,
    exam_number: normalized.examNumber || undefined,
    cohort_label: normalized.cohortLabel || undefined,
    birth_date: normalized.birthDate || undefined,
    gender: normalized.gender || undefined,
    series: normalized.series || undefined,
    memo: normalized.memo || undefined,
    photo_url: normalized.photoUrl || undefined,
    custom_data: normalized.customData,
  }
}

function toMasterSnapshot(student: Student): BulkImportMasterSnapshot {
  return {
    id: student.id,
    name: student.name,
    phone: student.phone,
    examNumber: student.exam_number ?? '',
    birthDate: student.birth_date ?? '',
    cohortOptionId: student.cohort_option_id,
  }
}

function getStudentIdentityConflictMessage() {
  return '기존 학생 마스터와 가져오기 행의 정보가 충돌합니다. 입력값과 마스터 값을 확인해 주세요.'
}

function createBulkImportIssue(
  row: ParsedEnrollmentRow,
  field: string,
  message: string,
  value?: string | null,
  master: BulkImportMasterSnapshot | null = null,
  fields: string[] = [field],
): BulkImportRowIssue {
  return {
    rowNumber: row.sourceLineNumber,
    lineNumber: row.sourceLineNumber,
    name: row.name,
    phoneLast4: normalizePhone(row.phone).slice(-4) || null,
    examNumber: row.exam_number ?? null,
    field,
    fields,
    value: value === undefined ? null : value,
    message,
    messages: [message],
    sourceText: row.sourceText,
    input: toEditableRow(row),
    master,
  }
}

function addBulkImportIssue(
  issuesByRow: Map<ParsedEnrollmentRow, BulkImportRowIssue>,
  row: ParsedEnrollmentRow,
  field: string,
  message: string,
  value?: string | null,
  master: BulkImportMasterSnapshot | null = null,
  fields: string[] = [field],
) {
  const existing = issuesByRow.get(row)
  if (!existing) {
    issuesByRow.set(
      row,
      createBulkImportIssue(row, field, message, value, master, fields),
    )
    return
  }

  existing.fields = Array.from(new Set([...existing.fields, ...fields]))
  if (!existing.messages.includes(message)) {
    existing.messages.push(message)
  }
  existing.message = existing.messages.join(' ')
  existing.master = master ?? existing.master
}

function getBulkImportKey(row: ParsedEnrollmentRow) {
  const examNumber = normalizeExamNumber(row.exam_number)
  return examNumber
    ? `exam:${examNumber}`
    : `identity:${normalizePhone(row.phone)}::${normalizeName(row.name)}::${row.birth_date ?? ''}`
}

function createBulkImportSuccessResponse(params: {
  totalCount: number
  importedCount: number
  rowErrors: BulkImportRowIssue[]
  generatedPins?: Array<{ name: string; phone: string; pin: string }>
}) {
  const rowErrors = [...params.rowErrors].sort((a, b) => a.lineNumber - b.lineNumber)
  const partial = rowErrors.length > 0

  return NextResponse.json(
    {
      success: true,
      partial,
      count: params.importedCount,
      totalCount: params.totalCount,
      errorCount: rowErrors.length,
      rowErrorCount: rowErrors.length,
      rowErrors,
      generated_pins: params.generatedPins && params.generatedPins.length > 0
        ? params.generatedPins
        : undefined,
      message: partial
        ? `정상 ${params.importedCount}명은 반영했고, 오류 ${rowErrors.length}명은 확인이 필요합니다.`
        : `${params.importedCount}명을 모두 반영했습니다.`,
    },
    params.generatedPins && params.generatedPins.length > 0
      ? { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      : undefined,
  )
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
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '명단 붙여넣기 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const db = createServerClient()
  const { data: course, error: courseError } = await db
    .from('courses')
    .select('id,enrollment_fields')
    .eq('id', parsed.data.courseId)
    .eq('division', division)
    .maybeSingle()

  if (courseError) {
    return NextResponse.json({ error: '강좌를 확인하지 못했습니다.' }, { status: 500 })
  }
  if (!course) {
    return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
  }

  const customFields = Array.isArray(course.enrollment_fields)
    ? course.enrollment_fields as EnrollmentFieldDef[]
    : []
  const rows = parsed.data.rows
    ? parsed.data.rows.map((row) => fromEditableRow(row))
    : parseEnrollmentBulkText(parsed.data.text ?? '', customFields)

  if (rows.length === 0) {
    return NextResponse.json({ error: '붙여넣기 텍스트에서 유효한 수강생을 찾지 못했습니다.' }, { status: 400 })
  }

  const issuesByRow = new Map<ParsedEnrollmentRow, BulkImportRowIssue>()
  for (const row of rows) {
    if (!row.name) {
      addBulkImportIssue(
        issuesByRow,
        row,
        'name',
        '이름이 비어 있습니다. 이름 열이 비었거나 열 순서가 밀렸는지 확인해 주세요.',
        row.name,
      )
    }

    const normalizedPhone = normalizePhone(row.phone)
    if (normalizedPhone.length < 8) {
      addBulkImportIssue(
        issuesByRow,
        row,
        'phone',
        '연락처가 비어 있거나 너무 짧습니다. 연락처 열과 숫자 입력을 확인해 주세요.',
        row.phone,
      )
    }

    if (!row.birth_date) {
      addBulkImportIssue(
        issuesByRow,
        row,
        'birth_date',
        '생년월일을 6자리 또는 8자리 날짜로 입력해 주세요.',
        row.birth_date ?? '',
      )
    }
  }

  const seriesOptions = await listBranchSeriesOptions({ includeInactive: false })
  for (const row of rows) {
    const label = row.series?.trim()
    if (label && !findBranchSeriesOptionByLabel(seriesOptions, label)) {
      addBulkImportIssue(
        issuesByRow,
        row,
        'series',
        `직렬 '${label}'은 현재 지점에서 사용할 수 없습니다.`,
        label,
      )
    }
  }

  const existingEnrollments = await db
    .from('enrollments')
    .select('*')
    .eq('course_id', parsed.data.courseId)

  if (existingEnrollments.error) {
    return NextResponse.json({ error: '수강생 명단을 저장하지 못했습니다.' }, { status: 500 })
  }

  const existingRows = (existingEnrollments.data ?? []) as ExistingEnrollmentRow[]
  const existingByStudentId = new Map<number, ExistingEnrollmentRow>()
  const existingByExamNumber = new Map<string, ExistingEnrollmentRow>()
  for (const enrollment of existingRows) {
    if (enrollment.student_id != null) {
      existingByStudentId.set(enrollment.student_id, enrollment)
    }
    const examNumber = normalizeExamNumber(enrollment.exam_number)
    if (examNumber && !existingByExamNumber.has(examNumber)) {
      existingByExamNumber.set(examNumber, enrollment)
    }
  }

  const rowsByKey = new Map<string, ParsedEnrollmentRow[]>()
  for (const row of rows) {
    const key = getBulkImportKey(row)
    rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), row])
  }

  const dedupedRows: ParsedEnrollmentRow[] = []
  for (const [key, sameKeyRows] of rowsByKey.entries()) {
    const first = sameKeyRows[0]!
    if (sameKeyRows.length === 1) {
      dedupedRows.push(first)
      continue
    }

    const sameIdentity = sameKeyRows.every((row) => (
      normalizeName(row.name) === normalizeName(first.name)
      && normalizePhone(row.phone) === normalizePhone(first.phone)
      && (row.birth_date ?? null) === (first.birth_date ?? null)
      && normalizeExamNumber(row.exam_number) === normalizeExamNumber(first.exam_number)
    ))

    if (sameIdentity) {
      dedupedRows.push(first)
      for (const duplicate of sameKeyRows.slice(1)) {
        addBulkImportIssue(
          issuesByRow,
          duplicate,
          'duplicate_row',
          `${first.sourceLineNumber}행과 같은 학생이 중복 입력되어 이 행은 제외했습니다.`,
          key,
        )
      }
      continue
    }

    for (const conflictRow of sameKeyRows) {
      addBulkImportIssue(
        issuesByRow,
        conflictRow,
        'exam_number',
        `같은 학번 또는 학생 식별값이 ${sameKeyRows.map((row) => `${row.sourceLineNumber}행`).join(', ')}에서 서로 다르게 입력되었습니다.`,
        normalizeExamNumber(conflictRow.exam_number),
        null,
        ['exam_number', 'name', 'phone', 'birth_date'],
      )
    }
  }

  const inspectionKeyByRow = new Map<ParsedEnrollmentRow, string>()
  const inspectionInputs = rows.map((row, index) => {
    const key = `row:${row.sourceLineNumber}:${index}`
    inspectionKeyByRow.set(row, key)
    const currentStudentId = findExistingEnrollmentForImportedRow(row, existingByExamNumber)?.student_id ?? null
    return {
      key,
      division,
      name: row.name,
      phone: row.phone,
      exam_number: row.exam_number,
      ...(currentStudentId ? { currentStudentId } : {}),
      birth_date: row.birth_date,
      photo_url: row.photo_url,
    }
  })

  const inspections = await inspectStudentProfilesBatch(db, inspectionInputs)
  for (const row of rows) {
    const inspection = inspections.get(inspectionKeyByRow.get(row) ?? '')
    const master = inspection?.student ? toMasterSnapshot(inspection.student) : null
    const existingEnrollment = findExistingEnrollmentForImportedRow(row, existingByExamNumber)
    if (inspection?.conflict) {
      addBulkImportIssue(
        issuesByRow,
        row,
        inspection.conflict.fields[0] ?? 'identity',
        getStudentIdentityConflictMessage(),
        null,
        master,
        inspection.conflict.fields,
      )
    } else if (existingEnrollment && !inspection?.student) {
      const snapshotMismatches = getBulkImportEnrollmentSnapshotMismatches(
        toEditableRow(row),
        existingEnrollment,
      )

      if (snapshotMismatches.length > 0 || existingEnrollment.student_id) {
        addBulkImportIssue(
          issuesByRow,
          row,
          snapshotMismatches[0] ?? 'identity',
          existingEnrollment.student_id
            ? '기존 수강 정보에 연결된 학생 마스터를 찾지 못했습니다. 학생 마스터 연결 상태를 확인해 주세요.'
            : '같은 학번의 기존 수강 정보와 이름 또는 연락처가 다릅니다. 기존 수강 정보를 확인해 주세요.',
          null,
          null,
          snapshotMismatches.length > 0 ? snapshotMismatches : ['identity'],
        )
      }
    } else if (master && issuesByRow.has(row)) {
      issuesByRow.get(row)!.master = master
    }
  }

  const cleanRowsByMasterStudentId = new Map<number, ParsedEnrollmentRow[]>()
  for (const row of dedupedRows) {
    if (issuesByRow.has(row)) {
      continue
    }
    const studentId = inspections.get(inspectionKeyByRow.get(row) ?? '')?.student?.id
    if (studentId) {
      cleanRowsByMasterStudentId.set(
        studentId,
        [...(cleanRowsByMasterStudentId.get(studentId) ?? []), row],
      )
    }
  }
  for (const matchingRows of cleanRowsByMasterStudentId.values()) {
    const first = matchingRows[0]
    if (!first || matchingRows.length === 1) {
      continue
    }
    for (const duplicate of matchingRows.slice(1)) {
      addBulkImportIssue(
        issuesByRow,
        duplicate,
        'duplicate_row',
        `${first.sourceLineNumber}행과 같은 학생 마스터로 확인되어 이 행은 제외했습니다.`,
      )
    }
  }

  const cohortIdByRow = new Map<ParsedEnrollmentRow, number | null | undefined>()
  const rowsReadyForCohort = dedupedRows.filter((row) => !issuesByRow.has(row))
  const rowsByCohortLabel = new Map<string, ParsedEnrollmentRow[]>()
  for (const row of rowsReadyForCohort) {
    if (row.cohort_label === undefined) {
      cohortIdByRow.set(row, undefined)
      continue
    }

    const label = row.cohort_label.trim()
    if (!label) {
      cohortIdByRow.set(row, null)
      continue
    }
    rowsByCohortLabel.set(label, [...(rowsByCohortLabel.get(label) ?? []), row])
  }

  for (const [label, matchingRows] of rowsByCohortLabel.entries()) {
    let cohortNumber: number | null | undefined
    try {
      cohortNumber = normalizeCohortNumber(label)
    } catch {
      for (const row of matchingRows) {
        addBulkImportIssue(
          issuesByRow,
          row,
          'cohort_label',
          `기수 '${label}'는 숫자로 해석할 수 없습니다.`,
          label,
        )
      }
      continue
    }

    const option = await resolveStudentCohortOptionByNumber(cohortNumber)
    if (!option) {
      for (const row of matchingRows) {
        addBulkImportIssue(
          issuesByRow,
          row,
          'cohort_label',
          `기수 '${label}'를 현재 지점 기수로 연결하지 못했습니다.`,
          label,
        )
      }
      continue
    }

    for (const row of matchingRows) {
      cohortIdByRow.set(row, option.id)
    }
  }

  const validRows = dedupedRows.filter((row) => !issuesByRow.has(row))
  if (validRows.length === 0) {
    return createBulkImportSuccessResponse({
      totalCount: rows.length,
      importedCount: 0,
      rowErrors: Array.from(issuesByRow.values()),
    })
  }

  const generatedPins: Array<{ name: string; phone: string; pin: string }> = []
  const validKeyByRow = new Map<ParsedEnrollmentRow, string>()
  const ensureInputs = validRows.map((row, index) => {
    const key = `valid:${row.sourceLineNumber}:${index}`
    validKeyByRow.set(row, key)
    const inspection = inspections.get(inspectionKeyByRow.get(row) ?? '')
    const currentStudentId = inspection?.student?.id
      ?? findExistingEnrollmentForImportedRow(row, existingByExamNumber)?.student_id
      ?? null

    return {
      key,
      division,
      name: row.name,
      phone: row.phone,
      exam_number: row.exam_number,
      ...(currentStudentId ? { currentStudentId } : {}),
      ...(cohortIdByRow.get(row) !== undefined ? { cohort_option_id: cohortIdByRow.get(row) } : {}),
      birth_date: row.birth_date,
      photo_url: row.photo_url,
    }
  })

  let studentResults: Awaited<ReturnType<typeof ensureStudentProfilesBatch>>
  try {
    studentResults = await ensureStudentProfilesBatch(db, ensureInputs)
  } catch (error) {
    if (isStudentIdentityConflictError(error)) {
      return NextResponse.json(
        { error: getStudentIdentityConflictMessage(), fields: error.fields },
        { status: 409 },
      )
    }
    throw error
  }

  const authSetup = await initializeStudentAuthBatch(
    db,
    validRows.map((row) => {
      const key = validKeyByRow.get(row)!
      const student = studentResults.get(key)?.student
      if (!student) {
        throw new Error('enrollments.bulk: student resolution failed')
      }
      return {
        key,
        student,
        birthDate: row.birth_date ?? null,
      }
    }),
  )

  for (const entry of authSetup.generatedPins) {
    generatedPins.push({
      name: entry.name,
      phone: entry.phone,
      pin: entry.pin,
    })
  }

  const changedStudents = Array.from(studentResults.values())
    .filter((result) => result.changed || result.created)
    .map((result) => result.student)
  await syncStudentEnrollmentSnapshotsBatch(db, changedStudents)

  const latestRowByStudentId = new Map<number, ParsedEnrollmentRow & {
    student: EnsureStudentProfileResult['student']
  }>()
  for (const row of validRows) {
    const key = validKeyByRow.get(row)!
    const resolvedStudent = authSetup.results.get(key)?.student ?? studentResults.get(key)?.student
    if (!resolvedStudent) {
      throw new Error('enrollments.bulk: auth setup failed')
    }
    latestRowByStudentId.set(resolvedStudent.id, { ...row, student: resolvedStudent })
  }

  const updates: Array<Record<string, unknown>> = []
  const inserts: Array<Record<string, unknown>> = []
  const defaultSeriesOption = resolveBranchSeriesOptionFromOptions(seriesOptions)
  for (const resolved of latestRowByStudentId.values()) {
    const student = resolved.student
    const examNumber = normalizeExamNumber(student.exam_number)
    const current = existingByStudentId.get(student.id)
      ?? (examNumber ? existingByExamNumber.get(examNumber) : null)
    const explicitSeriesOption = resolved.series
      ? findBranchSeriesOptionByLabel(seriesOptions, resolved.series)
      : null
    const payload = {
      student_id: student.id,
      name: student.name,
      phone: student.phone,
      exam_number: student.exam_number,
      gender: resolved.gender ?? current?.gender ?? null,
      region: resolved.region ?? current?.region ?? null,
      series_option_id: explicitSeriesOption?.id ?? current?.series_option_id ?? defaultSeriesOption?.id ?? null,
      series_group: explicitSeriesOption?.group_key ?? current?.series_group ?? defaultSeriesOption?.group_key ?? 'public',
      series: explicitSeriesOption?.label ?? current?.series ?? defaultSeriesOption?.label ?? '공채',
      photo_url: student.photo_url,
      memo: resolved.memo ?? current?.memo ?? null,
      custom_data: { ...(current?.custom_data ?? {}), ...(resolved.custom_data ?? {}) },
    }

    if (current) {
      updates.push({
        id: current.id,
        course_id: current.course_id,
        status: current.status,
        refunded_at: current.refunded_at,
        ...payload,
      })
    } else {
      inserts.push({
        course_id: parsed.data.courseId,
        ...payload,
      })
    }
  }

  if (updates.length > 0) {
    const { error } = await db
      .from('enrollments')
      .upsert(updates, { onConflict: 'id' })
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '중복된 수강생이 하나 이상 포함되어 있습니다.' }, { status: 409 })
      }
      return NextResponse.json({ error: '수강생 명단을 저장하지 못했습니다.' }, { status: 500 })
    }
  }

  if (inserts.length > 0) {
    const { error } = await db
      .from('enrollments')
      .insert(inserts)
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '중복된 수강생이 하나 이상 포함되어 있습니다.' }, { status: 409 })
      }
      return NextResponse.json({ error: '수강생 명단을 저장하지 못했습니다.' }, { status: 500 })
    }
  }

  await invalidateCache('enrollments')
  return createBulkImportSuccessResponse({
    totalCount: rows.length,
    importedCount: latestRowByStudentId.size,
    rowErrors: Array.from(issuesByRow.values()),
    generatedPins,
  })
}
