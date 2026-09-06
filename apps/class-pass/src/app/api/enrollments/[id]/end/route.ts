import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { getActorStaffId } from '@/lib/auth/actor'
import { authenticateAdminRequest } from '@/lib/auth/authenticate'
import { invalidateCache } from '@/lib/cache/revalidate'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const idSchema = z.coerce.number().int().positive().safe()
const endSchema = z.object({ reason: z.string().trim().min(1).max(1000) })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateAdminRequest(req)
    if (auth.error) return auth.error
    const featureError = await requireAppFeature('admin_student_management_enabled')
    if (featureError) return featureError

    const id = idSchema.safeParse((await params).id)
    const input = endSchema.safeParse(await req.json().catch(() => null))
    if (!id.success || !input.success) {
      return NextResponse.json({ error: '수강생과 종료 사유를 확인해 주세요. 사유는 1~1,000자까지 입력할 수 있습니다.' }, { status: 400 })
    }

    const db = createServerClient()
    const { data, error } = await db.rpc('end_enrollment_atomic', {
      p_division: await getServerTenantType(),
      p_enrollment_id: id.data,
      p_reason: input.data.reason,
      p_actor_staff_id: getActorStaffId(auth.payload),
    })
    if (error) {
      if (error.code === 'P0002') return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
      if (error.code === '22023') return NextResponse.json({ error: '종료 사유를 확인해 주세요.' }, { status: 400 })
      if (error.code === 'P0001') return NextResponse.json({ error: '현재 수강 상태에서는 종료할 수 없습니다.' }, { status: 409 })
      throw error
    }
    if (!data) return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })

    // The RPC has committed. A cache outage must not misreport the saved change as a failure.
    let refreshRequired = false
    try {
      await invalidateCache('enrollments')
    } catch {
      refreshRequired = true
    }
    return NextResponse.json({ enrollment: data, ...(refreshRequired ? { refreshRequired } : {}) })
  } catch (error) {
    return handleRouteError('enrollment.end', '수강 종료를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.', error)
  }
}
