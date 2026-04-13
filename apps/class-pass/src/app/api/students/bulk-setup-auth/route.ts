import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { initializeStudentAuth, listStudentsPendingAuthSetup } from '@/lib/student-profiles'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  division: z.string().optional(),
})

async function loadPendingStudents() {
  const db = createServerClient()
  const division = await getServerTenantType()
  const students = await listStudentsPendingAuthSetup(db, division)

  return {
    db,
    division,
    students,
  }
}

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) {
      return authError
    }

    const requestedDivision = req.nextUrl.searchParams.get('division')
    const { division, students } = await loadPendingStudents()
    if (requestedDivision && requestedDivision !== division) {
      return NextResponse.json({ error: '현재 지점과 요청 지점이 일치하지 않습니다.' }, { status: 400 })
    }

    const birthDateReadyCount = students.filter((student) => Boolean(student.birth_date)).length

    return NextResponse.json({
      total: students.length,
      birth_date_ready_count: birthDateReadyCount,
      pin_required_count: students.length - birthDateReadyCount,
    })
  } catch (error) {
    return handleRouteError('students.bulk-setup-auth.GET', '학생 인증 설정 현황을 불러오지 못했습니다.', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) {
      return authError
    }

    const body = await req.json().catch(() => ({}))
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '인증 일괄 설정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const { db, division, students } = await loadPendingStudents()
    if (parsed.data.division && parsed.data.division !== division) {
      return NextResponse.json({ error: '현재 지점과 요청 지점이 일치하지 않습니다.' }, { status: 400 })
    }

    const generatedPins: Array<{ name: string; phone: string; pin: string }> = []
    let birthDateCount = 0
    let pinCount = 0

    for (const student of students) {
      const result = await initializeStudentAuth(db, student, student.birth_date)

      if (result.student.auth_method === 'birth_date') {
        birthDateCount += 1
      }

      if (result.generatedPin) {
        pinCount += 1
        generatedPins.push({
          name: result.student.name,
          phone: result.student.phone,
          pin: result.generatedPin,
        })
      }
    }

    return NextResponse.json({
      total: students.length,
      birth_date_count: birthDateCount,
      pin_count: pinCount,
      generated_pins: generatedPins,
    })
  } catch (error) {
    return handleRouteError('students.bulk-setup-auth.POST', '학생 인증 정보를 일괄 설정하지 못했습니다.', error)
  }
}
