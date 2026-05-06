import { DesignatedSeatDisplaySurface } from '@/components/designated-seat/DesignatedSeatDisplaySurface'

export default async function DesignatedSeatDisplaySlotPage({
  params,
}: {
  params: Promise<{ slotKey: string }>
}) {
  const { slotKey } = await params
  return (
    <DesignatedSeatDisplaySurface
      targets={[{
        type: 'slot',
        slotKey,
      }]}
    />
  )
}
