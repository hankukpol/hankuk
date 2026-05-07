import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { checkRateLimit, getClientIp } from '@/lib/auth/rateLimiter'
import { verifyStudentAttendanceAccess } from '@/lib/attendance/service'
import { verifyStudentSeatAccess } from '@/lib/designated-seat/service'
import { logPresenceExceptionRequest } from '@/lib/presence/location'
import { presenceBrowserContextSchema, presenceErrorSchema } from '@/lib/presence/schema'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  courseId: z.number().int().positive(),
  enrollmentId: z.number().int().positive(),
  name: z.string().min(1),
  phone: z.string().min(10),
  feature: z.enum(['attendance', 'designated_seat']),
  browserContext: presenceBrowserContextSchema.optional(),
  errorCode: presenceErrorSchema.shape.errorCode.optional(),
  message: z.string().max(300).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const rateLimit = await checkRateLimit(`presence-exception:${getClientIp(req)}`)
    if (!rateLimit.allowed) {
      const retryAfterSec = Math.ceil(rateLimit.retryAfterMs / 1000)
      return NextResponse.json(
        { error: `Too many requests. Try again in ${retryAfterSec}s.` },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
      )
    }

    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '관리자 확인 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const access = parsed.data.feature === 'attendance'
      ? await verifyStudentAttendanceAccess({
        courseId: parsed.data.courseId,
        enrollmentId: parsed.data.enrollmentId,
        name: parsed.data.name,
        phone: parsed.data.phone,
        division,
      })
      : await verifyStudentSeatAccess({
        courseId: parsed.data.courseId,
        enrollmentId: parsed.data.enrollmentId,
        name: parsed.data.name,
        phone: parsed.data.phone,
        division,
      })

    if (!access) {
      return NextResponse.json({ error: '학생 정보를 확인하지 못했습니다.' }, { status: 404 })
    }

    await logPresenceExceptionRequest({
      courseId: access.course.id,
      enrollmentId: access.enrollment.id,
      feature: parsed.data.feature,
      browserContext: parsed.data.browserContext ?? null,
      errorCode: parsed.data.errorCode ?? null,
      message: parsed.data.message ?? null,
      details: {
        user_agent: req.headers.get('user-agent'),
      },
    })

    return NextResponse.json({
      ok: true,
      message: '관리자 확인 요청을 보냈습니다. 현장 데스크 또는 담당자에게 말씀해 주세요.',
    })
  } catch (error) {
    return handleRouteError('presence.exceptionRequest.POST', '관리자 확인 요청을 처리하지 못했습니다.', error)
  }
}
