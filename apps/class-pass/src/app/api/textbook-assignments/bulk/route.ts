import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
import {
  bulkAssignTextbooks,
  isTextbookAssignmentError,
  verifyEnrollmentOwnership,
} from '@/lib/class-pass-data'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  enrollmentId: z.number().int().positive(),
  materialIds: z.array(z.number().int().positive()),
})

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
    const ownership = await verifyEnrollmentOwnership(parsed.data.enrollmentId, division)
    if (!ownership.valid) {
      return NextResponse.json({ error: '수강생을 찾을 수 없습니다.' }, { status: 404 })
    }

    const assignments = await bulkAssignTextbooks(parsed.data.enrollmentId, parsed.data.materialIds, 'admin')
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
      return NextResponse.json({ error: '같은 과정의 교재만 배정할 수 있습니다.' }, { status: 400 })
    }

    return handleRouteError('textbook-assignments.bulk.POST', '교재를 일괄 배정하지 못했습니다.', error)
  }
}
