import { DesignatedSeatDisplaySurface } from '@/components/designated-seat/DesignatedSeatDisplaySurface'

export default async function DesignatedSeatDisplayPage({
  params,
}: {
  params: Promise<{ courseId: string }>
}) {
  const { courseId: courseIdParam } = await params
  const courseId = Number(courseIdParam)
  return (
    <DesignatedSeatDisplaySurface
      targets={[{
        type: 'course',
        courseId,
      }]}
    />
  )
}
