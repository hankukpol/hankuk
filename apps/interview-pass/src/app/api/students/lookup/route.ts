import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isAppFeatureEnabled } from '@/lib/app-config'
import { getClientIp, checkRateLimit } from '@/lib/auth/rateLimiter'
import { withDivisionFallback, withStudentStatusFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { generateQrToken } from '@/lib/qr/token'
import { ACTIVE_STUDENT_STATUS } from '@/lib/student-status'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { normalizeName, normalizePhone } from '@/lib/utils'

const schema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
})

async function getStudentByNamePhone(name: string, phone: string) {
  const db = createServerClient()
  const division = await getServerTenantType()

  const { data } = await withStudentStatusFallback(
    () =>
      withDivisionFallback(
        () =>
          db
            .from('students')
            .select('id,name,phone,exam_number,gender,region,series')
            .in('division', getScopedDivisionValues(division))
            .eq('status', ACTIVE_STUDENT_STATUS)
            .eq('name', name)
            .eq('phone', phone)
            .maybeSingle(),
        () =>
          db
            .from('students')
            .select('id,name,phone,exam_number,gender,region,series')
            .eq('status', ACTIVE_STUDENT_STATUS)
            .eq('name', name)
            .eq('phone', phone)
            .maybeSingle(),
      ),
    () =>
      withDivisionFallback(
        () =>
          db
            .from('students')
            .select('id,name,phone,exam_number,gender,region,series')
            .in('division', getScopedDivisionValues(division))
            .eq('name', name)
            .eq('phone', phone)
            .maybeSingle(),
        () =>
          db
            .from('students')
            .select('id,name,phone,exam_number,gender,region,series')
            .eq('name', name)
            .eq('phone', phone)
            .maybeSingle(),
      ),
  )

  return data
}

export async function POST(req: NextRequest) {
  if (!(await isAppFeatureEnabled('student_login_enabled'))) {
    return NextResponse.json({ error: '학생 로그인이 현재 비활성화되어 있습니다.' }, { status: 403 })
  }

  if (!(await isAppFeatureEnabled('student_receipt_enabled'))) {
    return NextResponse.json(
      { error: '학생 수령 포털이 현재 비활성화되어 있습니다.' },
      { status: 403 },
    )
  }

  const ip = getClientIp(req)
  const rateLimit = checkRateLimit(`lookup:${ip}`)
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
    return NextResponse.json({ error: '조회 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const name = normalizeName(parsed.data.name)
  const phone = normalizePhone(parsed.data.phone)
  const student = await getStudentByNamePhone(name, phone)

  if (!student) {
    return NextResponse.json({ error: '일치하는 학생 정보를 찾을 수 없습니다.' }, { status: 404 })
  }

  const token = await generateQrToken(student.id)
  return NextResponse.json({ token, student })
}
