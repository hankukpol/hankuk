import {
  getCourseById,
  listCourseEnrollments,
  listCourseSubjects,
  listSeatAssignmentsForCourse,
} from '@/lib/class-pass-data'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'
import CourseSeatsPageClient, { type SeatsPageData } from './course-seats-page-client'

type CourseSeatsPageProps = {
  params: Promise<{ id: string }>
}

async function loadInitialData(courseId: number): Promise<SeatsPageData | null> {
  const division = await getServerTenantType()
  const course = await getCourseById(courseId, division)
  if (!course) {
    return null
  }

  const [subjects, enrollments] = await Promise.all([
    listCourseSubjects(courseId),
    listCourseEnrollments(courseId),
  ])
  const seatAssignments = await listSeatAssignmentsForCourse(courseId)

  return {
    course,
    subjects,
    seatAssignments,
    enrollments,
  }
}

export default async function CourseSeatsPage({ params }: CourseSeatsPageProps) {
  const { id } = await params
  const courseId = parsePositiveInt(id)

  if (!courseId) {
    return <CourseSeatsPageClient initialError="잘못된 강의 ID입니다." initialLoaded />
  }

  try {
    const data = await loadInitialData(courseId)
    if (!data) {
      return <CourseSeatsPageClient initialError="강의를 찾을 수 없습니다." initialLoaded />
    }

    return <CourseSeatsPageClient initialData={data} />
  } catch {
    return <CourseSeatsPageClient initialError="좌석 관리 페이지를 불러오지 못했습니다." initialLoaded={false} />
  }
}
