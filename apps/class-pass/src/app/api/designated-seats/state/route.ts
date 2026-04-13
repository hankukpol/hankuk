import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { readStudentDeviceHashFromRequest } from '@/lib/designated-seat/device'
import {
  getDesignatedSeatStudentState,
  verifyStudentSeatAccess,
} from '@/lib/designated-seat/service'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  courseId: z.number().int().positive(),
  enrollmentId: z.number().int().positive(),
  name: z.string().min(1),
  phone: z.string().min(10),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '지정좌석 상태 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const access = await verifyStudentSeatAccess({
      courseId: parsed.data.courseId,
      enrollmentId: parsed.data.enrollmentId,
      name: parsed.data.name,
      phone: parsed.data.phone,
      division,
    })

    if (!access) {
      return NextResponse.json({ error: '학생 정보를 다시 확인해주세요.' }, { status: 404 })
    }

    const state = await getDesignatedSeatStudentState({
      course: access.course,
      enrollmentId: access.enrollment.id,
      deviceKeyHash: await readStudentDeviceHashFromRequest(req),
    })

    return NextResponse.json({ state })
  } catch (error) {
    return handleRouteError('designatedSeats.state.POST', '지정좌석 상태를 불러오지 못했습니다.', error)
  }
}
