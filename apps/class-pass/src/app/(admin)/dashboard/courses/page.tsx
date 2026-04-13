import { listCoursesByDivision } from '@/lib/class-pass-data'
import { getServerTenantType } from '@/lib/tenant.server'
import CoursesPageClient from './courses-page-client'

export default async function CoursesPage() {
  try {
    const division = await getServerTenantType()
    const courses = await listCoursesByDivision(division)
    return <CoursesPageClient initialCourses={courses} />
  } catch {
    return (
      <CoursesPageClient
        initialCourses={[]}
        initialError="강의 목록을 불러오지 못했습니다."
        initialLoaded={false}
      />
    )
  }
}
