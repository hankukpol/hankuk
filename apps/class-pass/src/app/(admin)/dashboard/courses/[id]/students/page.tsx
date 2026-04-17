import { getCourseById, listCourseEnrollments, listMaterialsForCourse } from '@/lib/class-pass-data'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'
import CourseStudentsPageClient from './course-students-page-client'
import type { StudentsPageData } from './students-page-types'

type CourseStudentsPageProps = {
  params: Promise<{ id: string }>
}

async function loadInitialData(courseId: number): Promise<StudentsPageData | null> {
  const division = await getServerTenantType()
  const course = await getCourseById(courseId, division)
  if (!course) {
    return null
  }

  const [enrollments, textbooks] = await Promise.all([
    listCourseEnrollments(courseId),
    listMaterialsForCourse(courseId, { materialType: 'textbook' }),
  ])

  return { course, enrollments, textbooks }
}

export default async function CourseStudentsPage({ params }: CourseStudentsPageProps) {
  const { id } = await params
  const courseId = parsePositiveInt(id)

  if (!courseId) {
    return <CourseStudentsPageClient initialError="잘못된 강의 ID입니다." initialLoaded />
  }

  try {
    const data = await loadInitialData(courseId)
    if (!data) {
      return <CourseStudentsPageClient initialError="강의를 찾을 수 없습니다." initialLoaded />
    }

    return <CourseStudentsPageClient initialData={data} />
  } catch {
    return <CourseStudentsPageClient initialError="수강생 관리 페이지를 불러오지 못했습니다." initialLoaded={false} />
  }
}
