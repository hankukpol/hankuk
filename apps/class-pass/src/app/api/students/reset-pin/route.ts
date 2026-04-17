import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
import { getStudentProfileById, resetStudentPin } from '@/lib/student-profiles'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  studentId: z.number().int().positive(),
})

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) {
      return authError
    }

    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '학생 PIN 재설정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const db = createServerClient()
    const student = await getStudentProfileById(db, parsed.data.studentId, division)

    if (!student) {
      return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })
    }

    const result = await resetStudentPin(db, student)
    if (!result.generatedPin) {
      return NextResponse.json({ error: 'PIN을 생성하지 못했습니다.' }, { status: 500 })
    }

    await invalidateCache('enrollments')
    return NextResponse.json({ pin: result.generatedPin })
  } catch (error) {
    return handleRouteError('students.reset-pin.POST', '학생 PIN을 재설정하지 못했습니다.', error)
  }
}
