import { CoursePaymentsPanel } from '@/components/payments/CoursePaymentsPanel'
import { getCourseById, listCourseEnrollments } from '@/lib/class-pass-data'
import { listPayments } from '@/lib/payments/service'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

type CoursePaymentsPageProps = {
  params: Promise<{ id: string }>
}

export default async function CoursePaymentsPage({ params }: CoursePaymentsPageProps) {
  const { id } = await params
  const courseId = parsePositiveInt(id)

  if (!courseId) {
    return <p className="py-12 text-center text-sm text-red-500">잘못된 강좌 ID입니다.</p>
  }

  const division = await getServerTenantType()
  const course = await getCourseById(courseId, division)
  if (!course) {
    return <p className="py-12 text-center text-sm text-red-500">강좌를 찾을 수 없습니다.</p>
  }

  const [enrollments, payments] = await Promise.all([
    listCourseEnrollments(courseId),
    listPayments({ courseId, limit: 500 }, division),
  ])

  return (
    <CoursePaymentsPanel
      course={course}
      enrollments={enrollments}
      initialPayments={payments}
    />
  )
}
