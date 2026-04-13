import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { handleRouteError } from '@/lib/api/error-response'
import { findEnrollmentForQuickDistribution, getCourseById, listMaterialsForCourse } from '@/lib/class-pass-data'
import { requireStaffApi } from '@/lib/auth/require-staff-api'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { normalizePhone } from '@/lib/utils'

const schema = z.object({
  courseId: z.number().int().positive(),
  phone: z.string().min(10),
  materialId: z.number().int().positive().optional(),
})

type DistributionResult = {
  success: boolean
  reason?: string
  material_name?: string
  student_name?: string
}

export async function POST(req: NextRequest) {
  try {
    const authError = await requireStaffApi(req)
    if (authError) {
      return authError
    }

    const featureError = await requireAppFeature('staff_scan_enabled')
    if (featureError) {
      return featureError
    }

    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '빠른 배부 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const course = await getCourseById(parsed.data.courseId, division)
    if (!course) {
      return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
    }

    const enrollment = await findEnrollmentForQuickDistribution(
      parsed.data.courseId,
      normalizePhone(parsed.data.phone),
    )
    if (!enrollment) {
      return NextResponse.json({ error: '일치하는 수강생을 찾지 못했습니다.' }, { status: 404 })
    }

    const materials = await listMaterialsForCourse(parsed.data.courseId, { activeOnly: true })
    if (materials.length === 0) {
      return NextResponse.json({ error: '활성 자료가 없습니다.' }, { status: 400 })
    }

    const targetMaterial =
      parsed.data.materialId === undefined && materials.length === 1
        ? materials[0]
        : materials.find((material) => material.id === parsed.data.materialId)

    if (!targetMaterial) {
      return NextResponse.json({ error: '배부할 자료를 선택해주세요.' }, { status: 400 })
    }

    const db = createServerClient()
    const rpcResult = await db.rpc('distribute_material', {
      p_enrollment_id: enrollment.id,
      p_material_id: targetMaterial.id,
    })

    if (rpcResult.error) {
      return NextResponse.json({ error: '자료 배부 처리에 실패했습니다.' }, { status: 500 })
    }

    const result = rpcResult.data as DistributionResult | null
    if (!result?.success) {
      return NextResponse.json({ error: result?.reason ?? '자료 배부 처리에 실패했습니다.' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      student_name: result.student_name ?? enrollment.name,
      material_name: result.material_name ?? targetMaterial.name,
    })
  } catch (error) {
    return handleRouteError('distribution.quick.POST', '빠른 배부 처리에 실패했습니다.', error)
  }
}
