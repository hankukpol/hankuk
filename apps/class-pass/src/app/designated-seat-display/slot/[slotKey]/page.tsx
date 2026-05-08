import { DesignatedSeatDisplaySurface } from '@/components/designated-seat/DesignatedSeatDisplaySurface'

export default async function DesignatedSeatDisplaySlotPage({
  params,
  searchParams,
}: {
  params: Promise<{ slotKey: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slotKey } = await params
  const query = await searchParams
  const roomId = Number(Array.isArray(query.roomId) ? query.roomId[0] : query.roomId)
  return (
    <DesignatedSeatDisplaySurface
      targets={[{
        type: 'slot',
        slotKey,
        roomId: Number.isInteger(roomId) && roomId > 0 ? roomId : null,
      }]}
    />
  )
}
