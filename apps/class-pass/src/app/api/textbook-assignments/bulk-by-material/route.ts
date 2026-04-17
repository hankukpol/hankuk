import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
import {
  assignTextbook,
  getMaterialSnapshotById,
  isTextbookAssignmentError,
  verifyEnrollmentOwnership,
  verifyMaterialOwnership,
} from '@/lib/class-pass-data'
import { getServerTenantType } from '@/lib/tenant.server'
import type { TextbookAssignment } from '@/types/database'

const schema = z.object({
  materialId: z.number().int().positive(),
  enrollmentIds: z.array(z.number().int().positive()),
})

const CHUNK_SIZE = 20

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const featureError = await requireAppFeature('admin_material_management_enabled')
    if (featureError) return featureError

    const body = await req.json().catch(() => null)
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '교재 일괄 배정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const materialOwnership = await verifyMaterialOwnership(parsed.data.materialId, division)
    if (!materialOwnership) {
      return NextResponse.json({ error: '교재를 찾을 수 없습니다.' }, { status: 404 })
    }

    const material = await getMaterialSnapshotById(parsed.data.materialId)
    if (!material || material.material_type !== 'textbook') {
      return NextResponse.json({ error: '교재를 찾을 수 없습니다.' }, { status: 404 })
    }

    const uniqueEnrollmentIds = Array.from(new Set(parsed.data.enrollmentIds))
    const ownerships = await Promise.all(
      uniqueEnrollmentIds.map((enrollmentId) => verifyEnrollmentOwnership(enrollmentId, division)),
    )

    if (ownerships.some((ownership) => !ownership.valid)) {
      return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (ownerships.some((ownership) => ownership.courseId !== material.course_id)) {
      return NextResponse.json({ error: '같은 과정 수강생에게만 배정할 수 있습니다.' }, { status: 400 })
    }

    const assignments: TextbookAssignment[] = []
    for (let index = 0; index < uniqueEnrollmentIds.length; index += CHUNK_SIZE) {
      const chunk = uniqueEnrollmentIds.slice(index, index + CHUNK_SIZE)
      const chunkAssignments = await Promise.all(
        chunk.map((enrollmentId) => assignTextbook(enrollmentId, material.id, 'admin')),
      )
      assignments.push(...chunkAssignments)
    }

    await invalidateCache('materials')
    return NextResponse.json({ assignments })
  } catch (error) {
    if (isTextbookAssignmentError(error, 'ENROLLMENT_NOT_FOUND')) {
      return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (isTextbookAssignmentError(error, 'TEXTBOOK_NOT_FOUND')) {
      return NextResponse.json({ error: '교재를 찾을 수 없습니다.' }, { status: 404 })
    }

    if (isTextbookAssignmentError(error, 'COURSE_MISMATCH')) {
      return NextResponse.json({ error: '같은 과정 수강생에게만 배정할 수 있습니다.' }, { status: 400 })
    }

    return handleRouteError('textbook-assignments.bulk-by-material.POST', '교재를 일괄 배정하지 못했습니다.', error)
  }
}
