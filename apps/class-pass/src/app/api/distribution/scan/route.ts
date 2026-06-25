import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireStaffApi } from '@/lib/auth/require-staff-api'
import {
  distributeMaterialsToEnrollment,
  resolvePendingDistributionSelection,
} from '@/lib/distribution/service'
import { verifyQrToken } from '@/lib/qr/token'
import { unwrapSupabaseResult } from '@/lib/supabase/result'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import type { Course, Enrollment } from '@/types/database'

const schema = z.object({
  token: z.string().min(1),
  courseId: z.number().int().positive(),
  materialId: z.number().int().positive().optional(),
  materialIds: z.array(z.number().int().positive()).optional(),
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
    const selectedCourseId = parsed.data.courseId
    const [courseResult, enrollmentResult, selectedCourseResult] = await Promise.all([
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
      selectedCourseId && selectedCourseId !== payload.courseId
        ? db
            .from('courses')
            .select('*')
            .eq('id', selectedCourseId)
            .eq('division', division)
            .eq('status', 'active')
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

    const course = unwrapSupabaseResult('distributionScan.course', courseResult)
    const enrollment = unwrapSupabaseResult('distributionScan.enrollment', enrollmentResult)
    const selectedCourse = unwrapSupabaseResult(
      'distributionScan.selectedCourse',
      selectedCourseResult,
    )

    if (!course || !enrollment) {
      return NextResponse.json({ success: false, reason: 'ENROLLMENT_NOT_FOUND' }, { status: 404 })
    }

    let distributionCourse = course as Course
    let distributionEnrollment = enrollment as Enrollment

    if (selectedCourseId && selectedCourseId !== payload.courseId) {
      const selectedEnrollmentQuery = db
        .from('enrollments')
        .select('*')
        .eq('course_id', selectedCourseId)
        .eq('status', 'active')

      let selectedEnrollmentResult
      if (distributionEnrollment.student_id != null) {
        selectedEnrollmentResult = await selectedEnrollmentQuery
          .eq('student_id', distributionEnrollment.student_id)
          .maybeSingle()
      } else {
        let fallbackQuery = selectedEnrollmentQuery
          .eq('name', distributionEnrollment.name)
          .eq('phone', distributionEnrollment.phone)

        if (distributionEnrollment.exam_number) {
          fallbackQuery = fallbackQuery.eq('exam_number', distributionEnrollment.exam_number)
        }

        selectedEnrollmentResult = await fallbackQuery.maybeSingle()
      }

      const selectedEnrollment = unwrapSupabaseResult(
        'distributionScan.selectedEnrollment',
        selectedEnrollmentResult,
      ) as Enrollment | null

      if (selectedCourse && selectedEnrollment) {
        distributionCourse = selectedCourse as Course
        distributionEnrollment = selectedEnrollment
      } else {
        return NextResponse.json(
          {
            success: false,
            reason: 'COURSE_MISMATCH',
            studentName: enrollment.name,
            courseName: course.name,
            selectedCourseName: selectedCourse?.name ?? null,
          },
          { status: 409 },
        )
      }
    }

    if (!distributionCourse.feature_qr_distribution) {
      return NextResponse.json({
        success: true,
        materialName: 'QR 인증',
        studentName: distributionEnrollment.name,
      })
    }

    const selection = await resolvePendingDistributionSelection({
      enrollmentId: distributionEnrollment.id,
      courseId: distributionCourse.id,
      materialId: parsed.data.materialId,
      materialIds: parsed.data.materialIds,
    })

    if (selection.kind === 'all_received') {
      return NextResponse.json({
        success: false,
        reason: 'ALL_RECEIVED',
        studentName: distributionEnrollment.name,
      })
    }

    if (selection.kind === 'needs_selection' || selection.kind === 'invalid_selection') {
      return NextResponse.json({
        success: false,
        reason: 'SELECT_MATERIAL',
        studentName: distributionEnrollment.name,
        needsSelection: true,
        unreceived: selection.materials,
      }, { status: 400 })
    }

    const distribution = await distributeMaterialsToEnrollment({
      enrollmentId: distributionEnrollment.id,
      studentName: distributionEnrollment.name,
      materials: selection.materials,
    })

    if (distribution.kind === 'failed' || distribution.kind === 'partial') {
      return NextResponse.json({
        success: false,
        reason: distribution.reason,
        studentName: distributionEnrollment.name,
        distributedMaterials: distribution.kind === 'partial'
          ? distribution.materials.map((material) => ({
            id: material.id,
            name: material.name,
            material_type: material.materialType,
          }))
          : [],
      }, { status: distribution.reason === 'DISTRIBUTION_FAILED' ? 500 : 400 })
    }

    const firstMaterial = distribution.materials[0]

    return NextResponse.json({
      success: true,
      materialName: distribution.materials.length === 1 ? firstMaterial?.name : `${distribution.materials.length}건`,
      materialType: distribution.materials.length === 1 ? firstMaterial?.materialType : undefined,
      studentName: distribution.studentName,
      distributedMaterials: distribution.materials.map((material) => ({
        id: material.id,
        name: material.name,
        material_type: material.materialType,
      })),
    })
  } catch (error) {
    return handleRouteError('distribution.scan.POST', 'QR 배부 처리에 실패했습니다.', error)
  }
}
