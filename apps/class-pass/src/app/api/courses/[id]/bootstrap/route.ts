import { NextRequest, NextResponse } from 'next/server'
import { handleRouteError } from '@/lib/api/error-response'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import {
  getCourseById,
  listCourseEnrollments,
  listMaterialsForCourse,
  listCourseSubjects,
  listSeatAssignmentsForCourse,
} from '@/lib/class-pass-data'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

type BootstrapView = 'students' | 'seats' | 'materials' | 'photos' | 'detail'

function parseBootstrapView(value: string | null): BootstrapView | null {
  if (value === 'students' || value === 'seats' || value === 'materials' || value === 'photos' || value === 'detail') {
    return value
  }

  return null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authError = await requireAdminApi(req)
    if (authError) {
      return authError
    }

    const { id } = await params
    const courseId = parsePositiveInt(id)
    const view = parseBootstrapView(req.nextUrl.searchParams.get('view'))

    if (!courseId) {
      return NextResponse.json({ error: '잘못된 강의 ID입니다.' }, { status: 400 })
    }

    if (!view) {
      return NextResponse.json({ error: '유효한 bootstrap view가 필요합니다.' }, { status: 400 })
    }

    const division = await getServerTenantType()
    const course = await getCourseById(courseId, division)
    if (!course) {
      return NextResponse.json({ error: '강의를 찾을 수 없습니다.' }, { status: 404 })
    }

    if (view === 'students' || view === 'photos') {
      const enrollments = await listCourseEnrollments(courseId)
      return NextResponse.json({ course, enrollments })
    }

    if (view === 'materials') {
      const materials = await listMaterialsForCourse(courseId)
      return NextResponse.json({ course, materials })
    }

    if (view === 'detail') {
      const subjects = await listCourseSubjects(courseId)
      return NextResponse.json({ course, subjects })
    }

    const [enrollments, subjects] = await Promise.all([
      listCourseEnrollments(courseId),
      listCourseSubjects(courseId),
    ])
    const seatAssignments = await listSeatAssignmentsForCourse(courseId)

    return NextResponse.json({
      course,
      subjects,
      seatAssignments,
      enrollments,
    })
  } catch (error) {
    return handleRouteError('courses.bootstrap.GET', '강의 초기 데이터를 불러오지 못했습니다.', error)
  }
}
