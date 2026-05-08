import {
  DesignatedSeatDisplaySurface,
  type DesignatedSeatDisplayClientTarget,
} from '@/components/designated-seat/DesignatedSeatDisplaySurface'
import { MAX_MULTI_DISPLAY_TARGETS } from '@/lib/designated-seat/display-targets'

function parseSlotTargets(value: string | string[] | undefined, roomId: number | null) {
  const raw = Array.isArray(value) ? value.join(',') : value ?? ''
  return raw
    .split(',')
    .map((item) => {
      const match = item.trim().toLowerCase().match(/^([a-z0-9]+(?:-[a-z0-9]+)*)(?::([1-9]\d*))?$/)
      if (!match) {
        return null
      }

      const targetRoomId = match[2] ? Number(match[2]) : roomId
      return {
        slotKey: match[1],
        roomId: targetRoomId != null && Number.isInteger(targetRoomId) && targetRoomId > 0 ? targetRoomId : null,
      }
    })
    .filter((item): item is { slotKey: string; roomId: number | null } => Boolean(item))
    .slice(0, MAX_MULTI_DISPLAY_TARGETS)
    .map((target) => ({
      type: 'slot' as const,
      slotKey: target.slotKey,
      roomId: target.roomId,
    }))
}

function parseCourseTargets(value: string | string[] | undefined, roomId: number | null) {
  const raw = Array.isArray(value) ? value.join(',') : value ?? ''
  return raw
    .split(',')
    .map((item) => {
      const match = item.trim().match(/^([1-9]\d*)(?::([1-9]\d*))?$/)
      if (!match) {
        return null
      }

      const targetRoomId = match[2] ? Number(match[2]) : roomId
      return {
        courseId: Number(match[1]),
        roomId: targetRoomId != null && Number.isInteger(targetRoomId) && targetRoomId > 0 ? targetRoomId : null,
      }
    })
    .filter((item): item is { courseId: number; roomId: number | null } => item !== null && item.courseId > 0)
    .slice(0, MAX_MULTI_DISPLAY_TARGETS)
    .map((target) => ({
      type: 'course' as const,
      courseId: target.courseId,
      roomId: target.roomId,
    }))
}

export default async function MultiDesignatedSeatDisplayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const parsedRoomId = Number(Array.isArray(params.roomId) ? params.roomId[0] : params.roomId)
  const roomId = Number.isInteger(parsedRoomId) && parsedRoomId > 0 ? parsedRoomId : null
  const targets: DesignatedSeatDisplayClientTarget[] = [
    ...parseSlotTargets(params.slots, roomId),
    ...parseCourseTargets(params.courses, roomId),
  ].slice(0, MAX_MULTI_DISPLAY_TARGETS)

  return <DesignatedSeatDisplaySurface targets={targets} />
}
