import { getCourseById, listCourseSubjects } from '@/lib/class-pass-data'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'
import CourseDetailPageClient, { type CourseDetailData } from './course-detail-page-client'

type CourseDetailPageProps = {
  params: Promise<{ id: string }>
}

async function loadInitialData(courseId: number): Promise<CourseDetailData | null> {
  const division = await getServerTenantType()
  const course = await getCourseById(courseId, division)
  if (!course) {
    return null
  }

  const subjects = await listCourseSubjects(courseId)
  return { course, subjects }
}

export default async function CourseDetailPage({ params }: CourseDetailPageProps) {
  const { id } = await params
  const courseId = parsePositiveInt(id)

  if (!courseId) {
    return <CourseDetailPageClient initialError="잘못된 강의 ID입니다." initialLoaded />
  }

  try {
    const data = await loadInitialData(courseId)
    if (!data) {
      return <CourseDetailPageClient initialError="강의를 찾을 수 없습니다." initialLoaded />
    }

    return <CourseDetailPageClient initialData={data} />
  } catch {
    return <CourseDetailPageClient initialError="강의 상세를 불러오지 못했습니다." initialLoaded={false} />
  }
}
