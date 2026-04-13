import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAppConfig } from '@/lib/app-config'
import { handleRouteError } from '@/lib/api/error-response'
import { buildPassPayload } from '@/lib/class-pass-data'
import { readStudentDeviceHashFromRequest } from '@/lib/designated-seat/device'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  enrollmentId: z.number().int().positive(),
  courseSlug: z.string().min(1),
  name: z.string().min(1),
  phone: z.string().min(10),
})

export async function POST(req: NextRequest) {
  try {
    const config = await getAppConfig()
    if (!config.student_pass_enabled) {
      return NextResponse.json({ error: '수강증 화면이 현재 비활성화되어 있습니다.' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '수강증 조회 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const deviceKeyHash = await readStudentDeviceHashFromRequest(req)
    const payload = await buildPassPayload({
      division,
      enrollmentId: parsed.data.enrollmentId,
      courseSlug: parsed.data.courseSlug,
      name: parsed.data.name,
      phone: parsed.data.phone,
      deviceKeyHash,
    })

    if (!payload) {
      return NextResponse.json({ error: '수강증 정보를 찾지 못했습니다.' }, { status: 404 })
    }

    return NextResponse.json(payload)
  } catch (error) {
    return handleRouteError('enrollments.pass.POST', '수강증 정보를 불러오지 못했습니다.', error)
  }
}
