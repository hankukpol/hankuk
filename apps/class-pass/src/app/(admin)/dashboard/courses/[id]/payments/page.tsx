import { redirect } from 'next/navigation'
import { withTenantPrefix } from '@/lib/tenant'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

type CoursePaymentsPageProps = {
  params: Promise<{ id: string }>
}

export default async function CoursePaymentsPage({ params }: CoursePaymentsPageProps) {
  const { id } = await params
  const courseId = parsePositiveInt(id)
  const division = await getServerTenantType()

  redirect(withTenantPrefix(`/dashboard/courses/${courseId ?? id}/students`, division))
}
