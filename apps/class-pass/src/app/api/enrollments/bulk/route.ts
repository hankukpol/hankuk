import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { parseEnrollmentBulkText } from '@/lib/bulk'
import { invalidateCache } from '@/lib/cache/revalidate'
import { getCourseById } from '@/lib/class-pass-data'
import {
  ensureStudentProfile,
  initializeStudentAuth,
  syncStudentEnrollmentSnapshots,
  type EnsureStudentProfileResult,
} from '@/lib/student-profiles'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { normalizeExamNumber, normalizePhone } from '@/lib/utils'

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
  const existingByPhoneName = new Map<string, ExistingEnrollmentRow>()

  for (const enrollment of existingRows) {
    if (enrollment.student_id != null) {
      existingByStudentId.set(enrollment.student_id, enrollment)
    }

    const examNumber = normalizeExamNumber(enrollment.exam_number)
    if (examNumber && !existingByExamNumber.has(examNumber)) {
      existingByExamNumber.set(examNumber, enrollment)
    }

    const phone = normalizePhone(enrollment.phone)
    const phoneNameKey = `${phone}::${enrollment.name}`
    if (phone && !existingByPhoneName.has(phoneNameKey)) {
      existingByPhoneName.set(phoneNameKey, enrollment)
    }
  }

  const cachedStudents = new Map<string, EnsureStudentProfileResult>()
  const latestRowByStudentId = new Map<number, (typeof rows)[number] & { student: EnsureStudentProfileResult['student'] }>()
  const generatedPins: Array<{ name: string; phone: string; pin: string }> = []

  for (const row of rows) {
    const key = row.exam_number?.trim()
      ? `exam:${normalizeExamNumber(row.exam_number)}`
      : `phone:${normalizePhone(row.phone)}::${row.name}`

    let student = cachedStudents.get(key)
    if (!student) {
      student = await ensureStudentProfile(db, {
        division,
        name: row.name,
        phone: row.phone,
        exam_number: row.exam_number,
        photo_url: row.photo_url,
      })
      cachedStudents.set(key, student)
    }

    const authSetup = await initializeStudentAuth(db, student.student, row.birth_date ?? null)
    if (authSetup.generatedPin) {
      generatedPins.push({
        name: authSetup.student.name,
        phone: authSetup.student.phone,
        pin: authSetup.generatedPin,
      })
    }

    latestRowByStudentId.set(authSetup.student.id, { ...row, student: authSetup.student })
  }

  for (const student of cachedStudents.values()) {
    if (student.changed || student.created) {
      await syncStudentEnrollmentSnapshots(db, student.student)
    }
  }

  const updates: Array<Record<string, unknown>> = []
  const inserts: Array<Record<string, unknown>> = []

  for (const resolved of latestRowByStudentId.values()) {
    const student = resolved.student
    const examNumber = normalizeExamNumber(student.exam_number)
    const phone = normalizePhone(student.phone)
    const current =
      existingByStudentId.get(student.id)
      ?? (examNumber ? existingByExamNumber.get(examNumber) : null)
      ?? existingByPhoneName.get(`${phone}::${student.name}`)

    const payload = {
      student_id: student.id,
      name: student.name,
      phone: student.phone,
      exam_number: student.exam_number,
      gender: resolved.gender ?? current?.gender ?? null,
      region: resolved.region ?? current?.region ?? null,
      series: resolved.series ?? current?.series ?? null,
      photo_url: student.photo_url,
      custom_data: resolved.custom_data ?? current?.custom_data ?? {},
    }

    if (current) {
      updates.push({
        id: current.id,
        ...payload,
      })
      continue
    }

    inserts.push({
      course_id: parsed.data.courseId,
      ...payload,
    })
  }

  for (const update of updates) {
    const { id, ...payload } = update
    const { error } = await db
      .from('enrollments')
      .update(payload)
      .eq('id', Number(id))

    if (error) {
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
  return NextResponse.json({
    success: true,
    count: latestRowByStudentId.size,
    generated_pins: generatedPins.length > 0 ? generatedPins : undefined,
  })
}
