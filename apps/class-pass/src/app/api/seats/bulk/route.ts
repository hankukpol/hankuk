import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { parseSeatBulkText } from '@/lib/bulk'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
import { getCourseById, listCourseEnrollments, listCourseSubjects } from '@/lib/class-pass-data'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { normalizeExamNumber, normalizeName } from '@/lib/utils'

const schema = z.object({
  courseId: z.number().int().positive(),
  text: z.string().min(1),
})

function normalizeSubjectLookupKey(value: string) {
  return normalizeName(value).replace(/\s+/g, '').toLowerCase()
}

function canonicalizeSubjectLookupKey(value: string) {
  const normalized = normalizeSubjectLookupKey(value)
  const aliasFamilies = [
    ['형사소송법', '형사소법', '형소법'],
    ['경찰학개론', '경찰학'],
    ['민사소송법', '민사소법', '민소법'],
  ]

  for (const family of aliasFamilies) {
    if (family.includes(normalized)) {
      return family[family.length - 1]
    }
  }

  return normalized
}

function getSubjectLookupKeys(value: string) {
  const base = normalizeSubjectLookupKey(value)
  const keys = new Set<string>([base, canonicalizeSubjectLookupKey(base)])

  return [...keys]
}

export async function POST(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_seat_management_enabled')
  if (featureError) {
    return featureError
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '좌석 붙여넣기 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const course = await getCourseById(parsed.data.courseId, division)
  if (!course) {
    return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
  }

  const [enrollments, subjects] = await Promise.all([
    listCourseEnrollments(parsed.data.courseId, { columns: 'id,name,exam_number' }),
    listCourseSubjects(parsed.data.courseId),
  ])
  const parsedSeats = parseSeatBulkText(parsed.data.text, {
    fallbackSubjectOrder: subjects.map((subject) => subject.name),
  })
  const rows = parsedSeats.rows

  if (rows.length === 0) {
    return NextResponse.json({ error: '붙여넣기 텍스트에서 좌석 데이터를 찾지 못했습니다.' }, { status: 400 })
  }

  const enrollmentMap = new Map<string, (typeof enrollments)[number]>()
  const duplicateExamNumbers = new Set<string>()
  for (const enrollment of enrollments) {
    const examNumber = normalizeExamNumber(enrollment.exam_number)
    if (!examNumber) {
      continue
    }

    if (enrollmentMap.has(examNumber)) {
      duplicateExamNumbers.add(examNumber)
      continue
    }

    enrollmentMap.set(examNumber, enrollment)
  }

  const subjectMap = new Map<string, (typeof subjects)[number]>()
  const duplicateSubjectNames = new Set<string>()
  for (const subject of subjects) {
    const lookupKeys = getSubjectLookupKeys(subject.name)
    if (lookupKeys.length === 0) {
      continue
    }

    for (const key of lookupKeys) {
      const existing = subjectMap.get(key)
      if (existing && existing.id !== subject.id) {
        duplicateSubjectNames.add(key)
        continue
      }

      subjectMap.set(key, subject)
    }
  }

  if (duplicateExamNumbers.size > 0) {
    return NextResponse.json(
      {
        error: '같은 강좌에 중복된 수험번호가 있어 좌석 데이터를 반영할 수 없습니다.',
        details: [...duplicateExamNumbers].map((value) => `중복 수험번호: ${value}`),
      },
      { status: 400 },
    )
  }

  if (duplicateSubjectNames.size > 0) {
    return NextResponse.json(
      {
        error: '같은 강좌에 중복된 과목명이 있어 좌석 데이터를 반영할 수 없습니다.',
        details: [...duplicateSubjectNames].map((value) => `중복 과목 키: ${value}`),
      },
      { status: 400 },
    )
  }

  const issues: string[] = []
  const seenTargets = new Map<string, number>()
  const payload = rows
    .map((row) => {
      if (!row.examNumber || !row.studentName || !row.subjectName || !row.seatNumber) {
        issues.push(`${row.lineNumber}행: 수험번호, 수강생 이름, 과목명, 좌석번호를 모두 입력해 주세요.`)
        return null
      }

      const enrollment = enrollmentMap.get(row.examNumber)
      if (!enrollment) {
        issues.push(`${row.lineNumber}행: 수험번호 ${row.examNumber}에 해당하는 수강생을 찾지 못했습니다.`)
        return null
      }

      if (normalizeName(enrollment.name) !== row.studentName) {
        issues.push(
          `${row.lineNumber}행: 수험번호 ${row.examNumber}의 이름은 "${enrollment.name}"입니다. 붙여넣은 이름을 확인해 주세요.`,
        )
        return null
      }

      const subject =
        subjectMap.get(normalizeSubjectLookupKey(row.subjectName))
        ?? subjectMap.get(canonicalizeSubjectLookupKey(row.subjectName))
      if (!subject) {
        issues.push(`${row.lineNumber}행: 과목명 "${row.subjectName}"을(를) 찾지 못했습니다.`)
        return null
      }

      const targetKey = `${enrollment.id}:${subject.id}`
      const firstLine = seenTargets.get(targetKey)
      if (firstLine) {
        issues.push(
          `${row.lineNumber}행: 수험번호 ${row.examNumber} / 과목 ${subject.name} 조합이 ${firstLine}행과 중복됩니다.`,
        )
        return null
      }

      seenTargets.set(targetKey, row.lineNumber)

      return {
        enrollment_id: enrollment.id,
        subject_id: subject.id,
        seat_number: row.seatNumber,
      }
    })
    .filter((value): value is { enrollment_id: number; subject_id: number; seat_number: string } => Boolean(value))

  if (issues.length > 0) {
    return NextResponse.json(
      {
        error: '붙여넣은 좌석 데이터에 확인이 필요한 항목이 있습니다.',
        details: issues,
        totalRows: parsedSeats.sourceRowCount,
        validRows: payload.length,
      },
      { status: 400 },
    )
  }

  if (payload.length === 0) {
    return NextResponse.json({ error: '적용할 좌석 데이터가 없습니다.' }, { status: 400 })
  }

  const db = createServerClient()
  const { error } = await db
    .from('seat_assignments')
    .upsert(payload, { onConflict: 'enrollment_id,subject_id', ignoreDuplicates: false })

  if (error) {
    return NextResponse.json({ error: '좌석 배정을 저장하지 못했습니다.' }, { status: 500 })
  }

  if (!course.feature_seat_assignment) {
    const { error: courseUpdateError } = await db
      .from('courses')
      .update({
        feature_seat_assignment: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', course.id)
      .eq('division', division)

    if (courseUpdateError) {
      return NextResponse.json({ error: '좌석 배정은 저장됐지만 강좌 좌석 기능을 활성화하지 못했습니다.' }, { status: 500 })
    }
  }

  await invalidateCache('courses')
  await invalidateCache('seats')
  return NextResponse.json({ success: true, count: payload.length, totalRows: parsedSeats.sourceRowCount })
}
