import { notFound, redirect } from 'next/navigation'
import { withTenantPrefix } from '@/lib/tenant'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

export default async function CourseEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const courseId = parsePositiveInt(id)
  if (!courseId) notFound()

  const division = await getServerTenantType()
  redirect(withTenantPrefix(`/dashboard/courses/${courseId}/students`, division))
}
