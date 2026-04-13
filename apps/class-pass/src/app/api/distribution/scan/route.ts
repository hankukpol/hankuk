import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { listMaterialsForCourse } from '@/lib/class-pass-data'
import { requireStaffApi } from '@/lib/auth/require-staff-api'
import { verifyQrToken } from '@/lib/qr/token'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  token: z.string().min(1),
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
      return NextResponse.json({ error: '스캔 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const payload = await verifyQrToken(parsed.data.token)
    if (!payload) {
      return NextResponse.json({ success: false, reason: 'INVALID_TOKEN' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const db = createServerClient()
    const [courseResult, enrollmentResult] = await Promise.all([
      db
        .from('courses')
        .select('*')
        .eq('id', payload.courseId)
        .eq('division', division)
        .eq('status', 'active')
        .maybeSingle(),
      db
        .from('enrollments')
        .select('*')
        .eq('id', payload.enrollmentId)
        .eq('course_id', payload.courseId)
        .eq('status', 'active')
        .maybeSingle(),
    ])

    const course = unwrapSupabaseResult('distributionScan.course', courseResult)
    const enrollment = unwrapSupabaseResult('distributionScan.enrollment', enrollmentResult)

    if (!course || !enrollment) {
      return NextResponse.json({ success: false, reason: 'ENROLLMENT_NOT_FOUND' }, { status: 404 })
    }

    if (!course.feature_qr_distribution) {
      return NextResponse.json({
        success: true,
        materialName: 'QR 인증',
        studentName: enrollment.name,
      })
    }

    const materials = await listMaterialsForCourse(course.id, { activeOnly: true })
    const receiptRows = unwrapSupabaseResult(
      'distributionScan.receipts',
      await db
        .from('distribution_logs')
        .select('material_id')
        .eq('enrollment_id', enrollment.id),
    ) as Array<{ material_id: number }> | null

    const receivedIds = new Set((receiptRows ?? []).map((row) => row.material_id))
    const unreceivedMaterials = materials.filter((material) => !receivedIds.has(material.id))

    if (unreceivedMaterials.length === 0) {
      return NextResponse.json({
        success: false,
        reason: 'ALL_RECEIVED',
        studentName: enrollment.name,
      })
    }

    const targetMaterial =
      parsed.data.materialId === undefined && unreceivedMaterials.length === 1
        ? unreceivedMaterials[0]
        : unreceivedMaterials.find((material) => material.id === parsed.data.materialId)

    if (!targetMaterial) {
      return NextResponse.json({
        success: false,
        reason: 'SELECT_MATERIAL',
        studentName: enrollment.name,
        needsSelection: true,
        unreceived: unreceivedMaterials.map((material) => ({
          id: material.id,
          name: material.name,
        })),
      }, { status: 400 })
    }

    const rpcResult = await db.rpc('distribute_material', {
      p_enrollment_id: enrollment.id,
      p_material_id: targetMaterial.id,
    })

    if (rpcResult.error) {
      return NextResponse.json({ success: false, reason: 'DISTRIBUTION_FAILED' }, { status: 500 })
    }

    const result = rpcResult.data as DistributionResult | null
    if (!result?.success) {
      return NextResponse.json({
        success: false,
        reason: result?.reason ?? 'DISTRIBUTION_FAILED',
        studentName: enrollment.name,
      })
    }

    return NextResponse.json({
      success: true,
      materialName: result.material_name ?? targetMaterial.name,
      studentName: result.student_name ?? enrollment.name,
    })
  } catch (error) {
    return handleRouteError('distribution.scan.POST', 'QR 배부 처리에 실패했습니다.', error)
  }
}
