import { DesignatedSeatDisplaySurface } from '@/components/designated-seat/DesignatedSeatDisplaySurface'

export default async function DesignatedSeatDisplayPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { courseId: courseIdParam } = await params
  const query = await searchParams
  const courseId = Number(courseIdParam)
  const roomId = Number(Array.isArray(query.roomId) ? query.roomId[0] : query.roomId)
  return (
    <DesignatedSeatDisplaySurface
      targets={[{
        type: 'course',
        courseId,
        roomId: Number.isInteger(roomId) && roomId > 0 ? roomId : null,
      }]}
    />
  )
}
