import { NextRequest, NextResponse } from 'next/server'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import {
  getTextbookAssignmentsByCourse,
  listMaterialsForCourse,
  verifyCourseOwnership,
} from '@/lib/class-pass-data'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import type { DistributionLog } from '@/types/database'
import { parsePositiveInt } from '@/lib/utils'

const RECEIPT_MATRIX_FETCH_CHUNK_SIZE = 1000

type ReceiptMatrixLogRow = Pick<DistributionLog, 'id' | 'enrollment_id' | 'material_id' | 'distributed_at'>
type ReceiptMatrixSeatRow = {
  id: number
  enrollment_id: number
  subject_id: number | null
}

async function listAllDistributionLogsByMaterialIds(
  db: ReturnType<typeof createServerClient>,
  materialIds: number[],
): Promise<ReceiptMatrixLogRow[]> {
  const rows: ReceiptMatrixLogRow[] = []

  for (let offset = 0; ; offset += RECEIPT_MATRIX_FETCH_CHUNK_SIZE) {
    const { data, error } = await db
      .from('distribution_logs')
      .select('id,enrollment_id,material_id,distributed_at')
      .in('material_id', materialIds)
      .order('material_id')
      .order('enrollment_id')
      .order('id')
      .range(offset, offset + RECEIPT_MATRIX_FETCH_CHUNK_SIZE - 1)

    if (error) {
      throw error
    }

    const page = (data ?? []) as ReceiptMatrixLogRow[]
    rows.push(...page)

    if (page.length < RECEIPT_MATRIX_FETCH_CHUNK_SIZE) {
      return rows
    }
  }
}

async function listAllSeatAssignmentsForCourseSubjects(
  db: ReturnType<typeof createServerClient>,
  courseId: number,
  subjectIds: number[],
): Promise<ReceiptMatrixSeatRow[]> {
  if (subjectIds.length === 0) {
    return []
  }

  const rows: ReceiptMatrixSeatRow[] = []

  for (let offset = 0; ; offset += RECEIPT_MATRIX_FETCH_CHUNK_SIZE) {
    const { data, error } = await db
      .from('seat_assignments')
      .select('id,enrollment_id,subject_id,enrollments!inner(course_id)')
      .in('subject_id', subjectIds)
      .eq('enrollments.course_id', courseId)
      .order('subject_id')
      .order('enrollment_id')
      .order('id')
      .range(offset, offset + RECEIPT_MATRIX_FETCH_CHUNK_SIZE - 1)

    if (error) {
      throw error
    }

    const page = (data ?? []) as ReceiptMatrixSeatRow[]
    rows.push(...page)

    if (page.length < RECEIPT_MATRIX_FETCH_CHUNK_SIZE) {
      return rows
    }
  }
}

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) return authError

    const courseId = parsePositiveInt(req.nextUrl.searchParams.get('courseId'))
    if (!courseId) {
      return NextResponse.json({ error: 'courseId가 필요합니다.' }, { status: 400 })
    }

    const materialType = req.nextUrl.searchParams.get('materialType')
    if (materialType && materialType !== 'handout' && materialType !== 'textbook') {
      return NextResponse.json({ error: 'materialType 값이 올바르지 않습니다.' }, { status: 400 })
    }

    const resolvedMaterialType = materialType === 'handout' || materialType === 'textbook'
      ? materialType
      : 'handout'
    const featureError = await requireAppFeature(
      resolvedMaterialType === 'textbook'
        ? 'admin_material_management_enabled'
        : 'admin_log_view_enabled',
    )
    if (featureError) return featureError

    const division = await getServerTenantType()
    if (!(await verifyCourseOwnership(courseId, division))) {
      return NextResponse.json({ error: '과정을 찾을 수 없습니다.' }, { status: 404 })
    }

    const materials = await listMaterialsForCourse(courseId, {
      activeOnly: true,
      materialType: resolvedMaterialType,
    })

    if (materials.length === 0) {
      return NextResponse.json({
        materials: [],
        logs: [],
        assignments: resolvedMaterialType === 'textbook' ? [] : undefined,
      })
    }

    const materialIds = materials.map((material) => material.id)
    const db = createServerClient()
    // handout 중 과목이 지정된 자료가 하나라도 있으면, 좌석 게이팅을 위해 좌석배정을 함께 조회한다.
    const seatGatedSubjectIds = resolvedMaterialType === 'handout'
      ? Array.from(new Set(
        materials
          .map((material) => material.subject_id)
          .filter((subjectId): subjectId is number => typeof subjectId === 'number'),
      ))
      : []
    const [logs, assignments, seatRows] = await Promise.all([
      listAllDistributionLogsByMaterialIds(db, materialIds),
      resolvedMaterialType === 'textbook'
        ? getTextbookAssignmentsByCourse(courseId)
        : Promise.resolve(undefined),
      listAllSeatAssignmentsForCourseSubjects(db, courseId, seatGatedSubjectIds),
    ])

    const seatAssignments = resolvedMaterialType === 'handout'
      ? seatRows
        .filter((row) => row.subject_id != null)
        .map((row) => ({ enrollment_id: Number(row.enrollment_id), subject_id: Number(row.subject_id) }))
      : undefined

    return NextResponse.json({
      materials,
      logs,
      assignments,
      seatAssignments,
    })
  } catch (error) {
    return handleRouteError('distribution.receipt-matrix.GET', '수령 현황을 불러오지 못했습니다.', error)
  }
}
