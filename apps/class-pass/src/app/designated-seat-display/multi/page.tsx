import {
  DesignatedSeatDisplaySurface,
  type DesignatedSeatDisplayClientTarget,
} from '@/components/designated-seat/DesignatedSeatDisplaySurface'
import { MAX_MULTI_DISPLAY_TARGETS } from '@/lib/designated-seat/display-targets'

function parseSlotTargets(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value.join(',') : value ?? ''
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item))
    .slice(0, MAX_MULTI_DISPLAY_TARGETS)
    .map((slotKey) => ({
      type: 'slot' as const,
      slotKey,
    }))
}

function parseCourseTargets(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value.join(',') : value ?? ''
  return raw
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((courseId) => Number.isInteger(courseId) && courseId > 0)
    .slice(0, MAX_MULTI_DISPLAY_TARGETS)
    .map((courseId) => ({
      type: 'course' as const,
      courseId,
    }))
}

export default async function MultiDesignatedSeatDisplayPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const targets: DesignatedSeatDisplayClientTarget[] = [
    ...parseSlotTargets(params.slots),
    ...parseCourseTargets(params.courses),
  ].slice(0, MAX_MULTI_DISPLAY_TARGETS)

  return <DesignatedSeatDisplaySurface targets={targets} />
}
