import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAppConfig } from '@/lib/app-config'
import { handleRouteError } from '@/lib/api/error-response'
import { verifyStudentAuth } from '@/lib/auth/student-auth'
import {
  getClientIp,
  peekRateLimit,
  recordRateLimitFailure,
  resetRateLimit,
} from '@/lib/auth/rateLimiter'
import { listStudentCoursesForStudent } from '@/lib/class-pass-data'
import { findMatchingStudentProfile } from '@/lib/student-profiles'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { normalizeName, normalizePhone } from '@/lib/utils'

const schema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  verificationCode: z.string().regex(/^\d{4,6}$/),
})

export async function POST(req: NextRequest) {
  try {
    const config = await getAppConfig()
    if (!config.student_login_enabled) {
      return NextResponse.json({ error: '학생 로그인이 현재 비활성화되어 있습니다.' }, { status: 403 })
    }

    if (!config.student_courses_enabled) {
      return NextResponse.json({ error: '수강 목록 화면이 현재 비활성화되어 있습니다.' }, { status: 403 })
    }

    const ip = getClientIp(req)
    const rateLimitKey = `lookup:${ip}`
    const rateLimit = peekRateLimit(rateLimitKey)

    if (!rateLimit.allowed) {
      const retryAfterSec = Math.ceil(rateLimit.retryAfterMs / 1000)
      return NextResponse.json(
        { error: `${retryAfterSec}초 후 다시 시도해 주세요.` },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
      )
    }

    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)

    if (!parsed.success) {
      recordRateLimitFailure(rateLimitKey)
      return NextResponse.json({ error: '조회 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const db = createServerClient()
    const student = await findMatchingStudentProfile(db, {
      division,
      name: normalizeName(parsed.data.name),
      phone: normalizePhone(parsed.data.phone),
    })

    if (!student) {
      recordRateLimitFailure(rateLimitKey)
      return NextResponse.json({ error: '학생 정보를 찾을 수 없습니다.' }, { status: 401 })
    }

    const verified = await verifyStudentAuth(student, parsed.data.verificationCode)
    if (!verified.ok) {
      if (verified.reason === 'no_auth_configured') {
        return NextResponse.json(
          { error: '인증 정보가 아직 설정되지 않았습니다. 학원에 문의해 주세요.' },
          { status: 403 },
        )
      }

      recordRateLimitFailure(rateLimitKey)
      return NextResponse.json({ error: '인증번호가 일치하지 않습니다.' }, { status: 401 })
    }

    const courses = await listStudentCoursesForStudent(division, student.id)
    if (courses.length === 0) {
      return NextResponse.json({ error: '일치하는 수강 이력을 찾지 못했습니다.' }, { status: 404 })
    }

    resetRateLimit(rateLimitKey)
    return NextResponse.json({ courses })
  } catch (error) {
    return handleRouteError('enrollments.lookup.POST', '수강 정보를 조회하지 못했습니다.', error)
  }
}
