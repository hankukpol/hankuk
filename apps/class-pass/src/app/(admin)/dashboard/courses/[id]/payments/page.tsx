import { CoursePaymentsPanel } from '@/components/payments/CoursePaymentsPanel'
import { getCourseById, listCourseEnrollments } from '@/lib/class-pass-data'
import {
  isPaymentSchemaMissing,
  listPayments,
  PAYMENT_SCHEMA_MISSING_MESSAGE,
} from '@/lib/payments/service'
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

  const enrollments = await listCourseEnrollments(courseId)
  let payments: Awaited<ReturnType<typeof listPayments>> = []
  let initialError = ''

  try {
    payments = await listPayments({ courseId, limit: 500 }, division)
  } catch (error) {
    if (!isPaymentSchemaMissing(error)) {
      throw error
    }

    initialError = PAYMENT_SCHEMA_MISSING_MESSAGE
  }

  return (
    <CoursePaymentsPanel
      course={course}
      enrollments={enrollments}
      initialPayments={payments}
      initialError={initialError}
    />
  )
}
