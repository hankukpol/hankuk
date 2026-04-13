import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { handleRouteError } from '@/lib/api/error-response'
import { verifyEnrollmentOwnership } from '@/lib/class-pass-data'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  enrollmentId: z.number().int().positive(),
  materialId: z.number().int().positive(),
})

type DistributionResult = {
  success: boolean
  reason?: string
  material_name?: string
  student_name?: string
}

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const featureError = await requireAppFeature('admin_log_view_enabled')
    if (featureError) return featureError

    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const ownership = await verifyEnrollmentOwnership(parsed.data.enrollmentId, division)
    if (!ownership.valid) {
      return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
    }

    const db = createServerClient()
    const rpcResult = await db.rpc('distribute_material', {
      p_enrollment_id: parsed.data.enrollmentId,
      p_material_id: parsed.data.materialId,
    })

    if (rpcResult.error) {
      return NextResponse.json({ error: '자료 배부 처리에 실패했습니다.' }, { status: 500 })
    }

    const result = rpcResult.data as DistributionResult | null
    if (!result?.success) {
      return NextResponse.json({ error: result?.reason ?? '자료 배부 처리에 실패했습니다.' }, { status: 400 })
    }

    await invalidateCache('distribution-logs')

    return NextResponse.json({
      success: true,
      student_name: result.student_name,
      material_name: result.material_name,
    })
  } catch (error) {
    return handleRouteError('distribution.manual.POST', '자료 배부 처리에 실패했습니다.', error)
  }
}
