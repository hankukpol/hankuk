import { NextRequest, NextResponse } from 'next/server'
import { toReceiptMap } from '@/lib/bulk'
import { handleRouteError } from '@/lib/api/error-response'
import { getReceiptRows, verifyEnrollmentOwnership } from '@/lib/class-pass-data'
import { checkRateLimit, getClientIp } from '@/lib/auth/rateLimiter'
import { createServerClient } from '@/lib/supabase/server'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { getServerTenantType } from '@/lib/tenant.server'
import { normalizeName, normalizePhone, parsePositiveInt } from '@/lib/utils'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ip = getClientIp(req)
    const rateLimit = checkRateLimit(`receipts:${ip}`)
    if (!rateLimit.allowed) {
      const retryAfterSec = Math.ceil(rateLimit.retryAfterMs / 1000)
      return NextResponse.json(
        { error: `요청 횟수를 초과했습니다. ${retryAfterSec}초 후에 다시 시도해주세요.` },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
      )
    }

    const { id } = await params
    const enrollmentId = parsePositiveInt(id)
    if (!enrollmentId) {
      return NextResponse.json({ error: '잘못된 수강생 ID입니다.' }, { status: 400 })
    }

    const name = req.nextUrl.searchParams.get('name')
    const phone = req.nextUrl.searchParams.get('phone')
    if (!name || !phone) {
      return NextResponse.json({ error: '본인 확인 정보가 필요합니다.' }, { status: 400 })
    }

    const db = createServerClient()
    const enrollment = unwrapSupabaseResult(
      'enrollmentReceipts.enrollment',
      await db
        .from('enrollments')
        .select('id')
        .eq('id', enrollmentId)
        .eq('name', normalizeName(name))
        .eq('phone', normalizePhone(phone))
        .eq('status', 'active')
        .maybeSingle(),
    )

    if (!enrollment) {
      return NextResponse.json({ error: '수강생 정보를 확인하지 못했습니다.' }, { status: 403 })
    }

    const division = await getServerTenantType()
    const ownership = await verifyEnrollmentOwnership(enrollmentId, division)
    if (!ownership.valid) {
      return NextResponse.json({ error: '수강생 정보를 확인하지 못했습니다.' }, { status: 403 })
    }

    return NextResponse.json({ receipts: toReceiptMap(await getReceiptRows(enrollmentId)) })
  } catch (error) {
    return handleRouteError('enrollments.receipts.GET', '수령 정보를 불러오지 못했습니다.', error)
  }
}
