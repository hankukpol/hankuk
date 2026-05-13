import { getCourseAnalytics } from '@/lib/course-analytics'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'
import { CourseAnalyticsClient } from './analytics-client'

type CourseAnalyticsPageProps = {
  params: Promise<{ id: string }>
}

export default async function CourseAnalyticsPage({ params }: CourseAnalyticsPageProps) {
  const { id } = await params
  const courseId = parsePositiveInt(id)
  if (!courseId) {
    return (
      <div className="rounded-[8px] bg-white px-5 py-8 text-sm text-rose-600">
        강좌 ID가 올바르지 않습니다.
      </div>
    )
  }

  const division = await getServerTenantType()
  const analytics = await getCourseAnalytics(courseId, division)
  if (!analytics) {
    return (
      <div className="rounded-[8px] bg-white px-5 py-8 text-sm text-rose-600">
        강좌를 찾을 수 없습니다.
      </div>
    )
  }

  return <CourseAnalyticsClient analytics={analytics} />
}
