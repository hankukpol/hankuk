import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireStaffApi } from '@/lib/auth/require-staff-api'
import {
  distributeMaterialToEnrollment,
  resolvePendingDistributionSelection,
} from '@/lib/distribution/service'
import { verifyQrToken } from '@/lib/qr/token'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  token: z.string().min(1),
  materialId: z.number().int().positive().optional(),
})

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

    const selection = await resolvePendingDistributionSelection({
      enrollmentId: enrollment.id,
      courseId: course.id,
      materialId: parsed.data.materialId,
    })

    if (selection.kind === 'all_received') {
      return NextResponse.json({
        success: false,
        reason: 'ALL_RECEIVED',
        studentName: enrollment.name,
      })
    }

    if (selection.kind === 'needs_selection' || selection.kind === 'invalid_selection') {
      return NextResponse.json({
        success: false,
        reason: 'SELECT_MATERIAL',
        studentName: enrollment.name,
        needsSelection: true,
        unreceived: selection.materials,
      }, { status: 400 })
    }

    const distribution = await distributeMaterialToEnrollment({
      enrollmentId: enrollment.id,
      studentName: enrollment.name,
      material: selection.material,
    })

    if (distribution.kind === 'failed') {
      return NextResponse.json({
        success: false,
        reason: distribution.reason,
        studentName: enrollment.name,
      }, { status: distribution.reason === 'DISTRIBUTION_FAILED' ? 500 : 400 })
    }

    return NextResponse.json({
      success: true,
      materialName: distribution.materialName,
      materialType: distribution.materialType,
      studentName: distribution.studentName,
    })
  } catch (error) {
    return handleRouteError('distribution.scan.POST', 'QR 배부 처리에 실패했습니다.', error)
  }
}
