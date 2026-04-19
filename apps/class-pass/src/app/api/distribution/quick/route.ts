import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { handleRouteError } from '@/lib/api/error-response'
import {
  findEnrollmentForQuickDistribution,
  getCourseById,
} from '@/lib/class-pass-data'
import {
  distributeMaterialsToEnrollment,
  resolvePendingDistributionSelection,
} from '@/lib/distribution/service'
import { requireStaffApi } from '@/lib/auth/require-staff-api'
import { getServerTenantType } from '@/lib/tenant.server'
import { normalizePhone } from '@/lib/utils'

const schema = z.object({
  courseId: z.number().int().positive(),
  phone: z.string().min(10),
  materialId: z.number().int().positive().optional(),
  materialIds: z.array(z.number().int().positive()).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const authError = await requireStaffApi(req)
    if (authError) {
      return authError
    }

    const featureError = await requireAppFeature('staff_quick_distribution_enabled')
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
      return NextResponse.json({ error: '과정을 찾을 수 없습니다.' }, { status: 404 })
    }

    const enrollment = await findEnrollmentForQuickDistribution(
      parsed.data.courseId,
      normalizePhone(parsed.data.phone),
    )
    if (!enrollment) {
      return NextResponse.json({ error: '일치하는 수강생을 찾지 못했습니다.' }, { status: 404 })
    }

    const selection = await resolvePendingDistributionSelection({
      enrollmentId: enrollment.id,
      courseId: course.id,
      materialId: parsed.data.materialId,
      materialIds: parsed.data.materialIds,
    })

    if (selection.kind === 'all_received') {
      return NextResponse.json({ error: '모든 자료를 이미 수령했습니다.' }, { status: 400 })
    }

    if (selection.kind === 'needs_selection') {
      return NextResponse.json({
        success: false,
        student_name: enrollment.name,
        needsSelection: true,
        available_materials: selection.materials,
      })
    }

    if (selection.kind === 'invalid_selection') {
      return NextResponse.json(
        { error: '이 수강생이 아직 받을 수 있는 자료를 선택해 주세요.' },
        { status: 400 },
      )
    }

    const distribution = await distributeMaterialsToEnrollment({
      enrollmentId: enrollment.id,
      studentName: enrollment.name,
      materials: selection.materials,
    })

    if (distribution.kind === 'failed' || distribution.kind === 'partial') {
      if (distribution.reason === 'NOT_ASSIGNED') {
        return NextResponse.json({ error: '해당 수강생에게 배정되지 않은 교재입니다.' }, { status: 400 })
      }

      return NextResponse.json(
        {
          error: distribution.reason === 'DISTRIBUTION_FAILED'
            ? '자료 배부 처리에 실패했습니다.'
            : distribution.reason,
          distributed_materials: distribution.kind === 'partial'
            ? distribution.materials.map((material) => ({
              id: material.id,
              name: material.name,
              material_type: material.materialType,
            }))
            : [],
        },
        { status: distribution.reason === 'DISTRIBUTION_FAILED' ? 500 : 400 },
      )
    }

    const firstMaterial = distribution.materials[0]

    return NextResponse.json({
      success: true,
      student_name: distribution.studentName,
      material_name: distribution.materials.length === 1 ? firstMaterial?.name : `${distribution.materials.length}건`,
      material_type: distribution.materials.length === 1 ? firstMaterial?.materialType : undefined,
      distributed_materials: distribution.materials.map((material) => ({
        id: material.id,
        name: material.name,
        material_type: material.materialType,
      })),
    })
  } catch (error) {
    return handleRouteError('distribution.quick.POST', '빠른 배부 처리에 실패했습니다.', error)
  }
}
