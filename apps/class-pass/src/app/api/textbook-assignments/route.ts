import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
import {
  assignTextbook,
  getTextbookAssignmentsByCourse,
  isTextbookAssignmentError,
  unassignTextbook,
  verifyCourseOwnership,
  verifyEnrollmentOwnership,
  verifyMaterialOwnership,
} from '@/lib/class-pass-data'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

const assignmentSchema = z.object({
  enrollmentId: z.number().int().positive(),
  materialId: z.number().int().positive(),
})

function mapAssignmentError(error: unknown) {
  if (isTextbookAssignmentError(error, 'ENROLLMENT_NOT_FOUND')) {
    return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
  }

  if (isTextbookAssignmentError(error, 'TEXTBOOK_NOT_FOUND')) {
    return NextResponse.json({ error: '교재를 찾을 수 없습니다.' }, { status: 404 })
  }

  if (isTextbookAssignmentError(error, 'COURSE_MISMATCH')) {
    return NextResponse.json({ error: '같은 과정의 교재만 배정할 수 있습니다.' }, { status: 400 })
  }

  if (isTextbookAssignmentError(error, 'ALREADY_DISTRIBUTED')) {
    return NextResponse.json(
      { error: '이미 수령 처리된 교재는 배정을 해제할 수 없습니다. 수령 이력을 먼저 취소해 주세요.' },
      { status: 400 },
    )
  }

  return null
}

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const featureError = await requireAppFeature('admin_material_management_enabled')
    if (featureError) return featureError

    const courseId = parsePositiveInt(req.nextUrl.searchParams.get('courseId'))
    if (!courseId) {
      return NextResponse.json({ error: 'courseId가 필요합니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    if (!(await verifyCourseOwnership(courseId, division))) {
      return NextResponse.json({ error: '과정을 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json({
      assignments: await getTextbookAssignmentsByCourse(courseId),
    })
  } catch (error) {
    return handleRouteError('textbook-assignments.GET', '교재 배정 정보를 불러오지 못했습니다.', error)
  }
}

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const featureError = await requireAppFeature('admin_material_management_enabled')
    if (featureError) return featureError

    const body = await req.json().catch(() => null)
    const parsed = assignmentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '교재 배정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const [enrollmentOwnership, materialOwnership] = await Promise.all([
      verifyEnrollmentOwnership(parsed.data.enrollmentId, division),
      verifyMaterialOwnership(parsed.data.materialId, division),
    ])

    if (!enrollmentOwnership.valid) {
      return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (!materialOwnership) {
      return NextResponse.json({ error: '교재를 찾을 수 없습니다.' }, { status: 404 })
    }

    const assignment = await assignTextbook(parsed.data.enrollmentId, parsed.data.materialId, 'admin')
    await invalidateCache('materials')
    return NextResponse.json({ assignment })
  } catch (error) {
    const mapped = mapAssignmentError(error)
    if (mapped) {
      return mapped
    }

    return handleRouteError('textbook-assignments.POST', '교재를 배정하지 못했습니다.', error)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const featureError = await requireAppFeature('admin_material_management_enabled')
    if (featureError) return featureError

    const body = await req.json().catch(() => null)
    const parsed = assignmentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '교재 배정 해제 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const [enrollmentOwnership, materialOwnership] = await Promise.all([
      verifyEnrollmentOwnership(parsed.data.enrollmentId, division),
      verifyMaterialOwnership(parsed.data.materialId, division),
    ])

    if (!enrollmentOwnership.valid) {
      return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (!materialOwnership) {
      return NextResponse.json({ error: '교재를 찾을 수 없습니다.' }, { status: 404 })
    }

    await unassignTextbook(parsed.data.enrollmentId, parsed.data.materialId)
    await invalidateCache('materials')
    return NextResponse.json({ success: true })
  } catch (error) {
    const mapped = mapAssignmentError(error)
    if (mapped) {
      return mapped
    }

    return handleRouteError('textbook-assignments.DELETE', '교재 배정을 해제하지 못했습니다.', error)
  }
}
