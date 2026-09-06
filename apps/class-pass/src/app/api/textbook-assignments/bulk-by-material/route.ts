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
  enrollmentIds: z.array(z.number().int().positive()).min(1).max(2000),
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
    // Finish all ownership checks before the first write, with bounded concurrency.
    const ownerships = []
    for (let index = 0; index < uniqueEnrollmentIds.length; index += CHUNK_SIZE) {
      ownerships.push(...await Promise.all(uniqueEnrollmentIds.slice(index, index + CHUNK_SIZE)
        .map((enrollmentId) => verifyEnrollmentOwnership(enrollmentId, division))))
    }

    if (ownerships.some((ownership) => !ownership.valid)) {
      return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (ownerships.some((ownership) => ownership.courseId !== material.course_id)) {
      return NextResponse.json({ error: '같은 과정 수강생에게만 배정할 수 있습니다.' }, { status: 400 })
    }

    const assignments: TextbookAssignment[] = []
    const failures: Array<{ enrollmentId: number; message: string }> = []
    for (let index = 0; index < uniqueEnrollmentIds.length; index += CHUNK_SIZE) {
      const chunk = uniqueEnrollmentIds.slice(index, index + CHUNK_SIZE)
      const results = await Promise.allSettled(
        chunk.map((enrollmentId) => assignTextbook(enrollmentId, material.id, 'admin', division)),
      )
      results.forEach((result, position) => {
        if (result.status === 'fulfilled') {
          assignments.push(result.value)
        } else {
          console.error('textbook-assignments.bulk-by-material.item', result.reason)
          failures.push({ enrollmentId: chunk[position], message: '교재 배정을 확인하지 못했습니다. 배정 현황을 확인한 뒤 다시 시도해 주세요.' })
        }
      })
    }

    // A failed response may still have committed. Refresh even when every item failed.
    let warning: string | undefined
    try {
      await invalidateCache('materials')
    } catch (error) {
      console.error('textbook-assignments.bulk-by-material.cache', error)
      warning = '배정 결과는 아래와 같습니다. 다른 화면의 반영이 늦으면 잠시 후 새로고침해 주세요.'
    }
    return NextResponse.json({ assignments, failures, success_count: assignments.length, failed_count: failures.length, warning })
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
