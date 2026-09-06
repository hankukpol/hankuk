import { NextRequest, NextResponse } from 'next/server'
import { requireStudentSession } from '@/lib/auth/student-session'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { buildArchivedPassPayload } from '@/lib/class-pass-data'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  enrollmentId: z.number().int().positive(),
  courseSlug: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().min(10),
})

export async function POST(req: NextRequest) {
  try {
    const studentSession = await requireStudentSession(req)
    if (studentSession instanceof NextResponse) return studentSession

    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '보관 강좌 조회 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const result = await buildArchivedPassPayload({
      division,
      enrollmentId: parsed.data.enrollmentId,
      studentId: studentSession.studentId,
      courseSlug: parsed.data.courseSlug,
      name: parsed.data.name,
      phone: parsed.data.phone,
    })

    if (result.kind === 'not_found') {
      return NextResponse.json({ error: '보관 강좌 정보를 찾지 못했습니다.' }, { status: 404 })
    }

    if (result.kind === 'active') {
      return NextResponse.json(
        {
          error: '운영 중 강좌입니다.',
          reason: 'COURSE_ACTIVE',
          redirectTo: result.redirectTo,
        },
        { status: 409 },
      )
    }

    if (result.kind === 'redirect') {
      return NextResponse.json(
        {
          error: '강좌 경로가 변경되었습니다.',
          reason: 'COURSE_ROUTE_UPDATED',
          redirectTo: result.redirectTo,
        },
        { status: 409 },
      )
    }

    return NextResponse.json(result.payload, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    return handleRouteError('enrollments.archivedPass.POST', '보관 강좌 정보를 불러오지 못했습니다.', error)
  }
}
