import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { resolveBranchSeriesOption } from '@/lib/branch-series'
import { parseEnrollmentBulkText } from '@/lib/bulk'
import { invalidateCache } from '@/lib/cache/revalidate'
import { getCourseById } from '@/lib/class-pass-data'
import { normalizeCohortNumber, resolveStudentCohortOptionByNumber } from '@/lib/student-cohorts'
import {
  ensureStudentProfilesBatch,
  initializeStudentAuthBatch,
  isStudentIdentityConflictError,
  syncStudentEnrollmentSharedDetailsBatch,
  syncStudentEnrollmentSnapshotsBatch,
  type EnsureStudentProfileResult,
} from '@/lib/student-profiles'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { normalizeExamNumber, normalizeName, normalizePhone } from '@/lib/utils'

const schema = z.object({
  courseId: z.number().int().positive(),
  text: z.string().min(1),
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
  const course = await getCourseById(parsed.data.courseId, division)
  if (!course) {
    return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
  }

  const customFieldKeys = (course.enrollment_fields ?? []).map((f: { key: string }) => f.key)
  const rows = parseEnrollmentBulkText(parsed.data.text, customFieldKeys)
  if (rows.length === 0) {
    return NextResponse.json({ error: '붙여넣기 텍스트에서 유효한 수강생을 찾지 못했습니다.' }, { status: 400 })
  }

  const rowsMissingBirthDate = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !row.birth_date)
  if (rowsMissingBirthDate.length > 0) {
    return NextResponse.json(
      {
        error: 'birth_date is required for every imported student.',
        rows: rowsMissingBirthDate.slice(0, 20).map(({ row, index }) => ({
          rowNumber: index + 1,
          name: row.name,
          phoneLast4: normalizePhone(row.phone).slice(-4),
          examNumber: row.exam_number ?? null,
        })),
      },
      { status: 400 },
    )
  }

  const db = createServerClient()
  const existingEnrollments = (
    await db
      .from('enrollments')
      .select('*')
      .eq('course_id', parsed.data.courseId)
  )

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

  const latestRowByKey = new Map<string, (typeof rows)[number]>()
  const generatedPins: Array<{ name: string; phone: string; pin: string }> = []
  const cohortIdByKey = new Map<string, number | null | undefined>()

  for (const row of rows) {
    const key = row.exam_number?.trim()
      ? `exam:${normalizeExamNumber(row.exam_number)}`
      : `identity:${normalizePhone(row.phone)}::${normalizeName(row.name)}::${row.birth_date ?? ''}`

    const existing = latestRowByKey.get(key)
    if (
      existing
      && (
        normalizeName(existing.name) !== normalizeName(row.name)
        || normalizePhone(existing.phone) !== normalizePhone(row.phone)
        || (existing.birth_date ?? null) !== (row.birth_date ?? null)
      )
    ) {
      return NextResponse.json(
        {
          error: 'Duplicate import rows use the same exam number with different name, phone, or birth date.',
        },
        { status: 409 },
      )
    }

    latestRowByKey.set(key, row)
  }

  const cohortLabels = Array.from(new Set(
    Array.from(latestRowByKey.values())
      .map((row) => row.cohort_label?.trim())
      .filter((label): label is string => Boolean(label)),
  ))
  const cohortByLabel = new Map<string, number>()
  for (const label of cohortLabels) {
    let cohortNumber: number | null | undefined
    try {
      cohortNumber = normalizeCohortNumber(label)
    } catch {
      return NextResponse.json({
        error: `기수는 숫자만 입력해 주세요. 문제가 있는 값: ${label}`,
      }, { status: 400 })
    }
    const option = await resolveStudentCohortOptionByNumber(cohortNumber)
    if (!option) {
      return NextResponse.json({
        error: `기수 '${label}'를 처리하지 못했습니다.`,
      }, { status: 400 })
    }
    cohortByLabel.set(label, option.id)
  }

  for (const [key, row] of latestRowByKey.entries()) {
    if (row.cohort_label === undefined) {
      cohortIdByKey.set(key, undefined)
      continue
    }
    const label = row.cohort_label.trim()
    cohortIdByKey.set(key, label ? cohortByLabel.get(label) ?? null : null)
  }

  let studentResults: Awaited<ReturnType<typeof ensureStudentProfilesBatch>>
  try {
    studentResults = await ensureStudentProfilesBatch(
      db,
      Array.from(latestRowByKey.entries()).map(([key, row]) => ({
        key,
        division,
        name: row.name,
        phone: row.phone,
        exam_number: row.exam_number,
        ...(cohortIdByKey.get(key) !== undefined ? { cohort_option_id: cohortIdByKey.get(key) } : {}),
        birth_date: row.birth_date,
        photo_url: row.photo_url,
      })),
    )
  } catch (error) {
    if (isStudentIdentityConflictError(error)) {
      return NextResponse.json({ error: error.message, fields: error.fields }, { status: 409 })
    }

    throw error
  }

  const authSetup = await initializeStudentAuthBatch(
    db,
    Array.from(latestRowByKey.entries()).map(([key, row]) => {
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

  const latestRowByStudentId = new Map<number, (typeof rows)[number] & { student: EnsureStudentProfileResult['student'] }>()
  for (const [key, row] of latestRowByKey.entries()) {
    const resolvedStudent = authSetup.results.get(key)?.student ?? studentResults.get(key)?.student
    if (!resolvedStudent) {
      throw new Error('enrollments.bulk: auth setup failed')
    }

    latestRowByStudentId.set(resolvedStudent.id, { ...row, student: resolvedStudent })
  }

  const updates: Array<Record<string, unknown>> = []
  const inserts: Array<Record<string, unknown>> = []
  const sharedDetailsEntries: Array<{
    studentId: number
    details: Parameters<typeof syncStudentEnrollmentSharedDetailsBatch>[1][number]['details']
  }> = []
  const defaultSeriesOption = await resolveBranchSeriesOption()

  for (const resolved of latestRowByStudentId.values()) {
    const student = resolved.student
    const examNumber = normalizeExamNumber(student.exam_number)
    const current =
      existingByStudentId.get(student.id)
      ?? (examNumber ? existingByExamNumber.get(examNumber) : null)
    const explicitSeriesOption = resolved.series
      ? await resolveBranchSeriesOption({ label: resolved.series })
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
      custom_data: resolved.custom_data ?? current?.custom_data ?? {},
    }
    const sharedDetails: Parameters<typeof syncStudentEnrollmentSharedDetailsBatch>[1][number]['details'] = {
      ...(resolved.gender !== undefined ? { gender: resolved.gender ?? null } : {}),
      ...(explicitSeriesOption ? {
        series_option_id: explicitSeriesOption.id,
        series_group: explicitSeriesOption.group_key,
        series: explicitSeriesOption.label,
      } : {}),
    }
    if (Object.keys(sharedDetails).length > 0) {
      sharedDetailsEntries.push({
        studentId: student.id,
        details: sharedDetails,
      })
    }

    if (current) {
      updates.push({
        id: current.id,
        course_id: current.course_id,
        status: current.status,
        memo: current.memo,
        refunded_at: current.refunded_at,
        ...payload,
      })
      continue
    }

    inserts.push({
      course_id: parsed.data.courseId,
      ...payload,
    })
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

  await syncStudentEnrollmentSharedDetailsBatch(db, sharedDetailsEntries)

  await invalidateCache('enrollments')
  return NextResponse.json(
    {
      success: true,
      count: latestRowByStudentId.size,
      generated_pins: generatedPins.length > 0 ? generatedPins : undefined,
    },
    generatedPins.length > 0
      ? { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      : undefined,
  )
}
