import { getCourseById } from '@/lib/class-pass-data'
import { createServerClient } from '@/lib/supabase/server'
import { withTenantPrefix, type TenantType } from '@/lib/tenant'
import type { Course, DesignatedSeatDisplaySlot } from '@/types/database'

export const DISPLAY_SLOT_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const MAX_MULTI_DISPLAY_TARGETS = 6

export type DesignatedSeatDisplayTarget =
  | {
    mode: 'course'
    course: Course
    slot: null
  }
  | {
    mode: 'slot'
    course: Course
    slot: DesignatedSeatDisplaySlot
  }

export type DisplaySlotWithCourse = DesignatedSeatDisplaySlot & {
  course: Pick<Course, 'id' | 'name' | 'status' | 'enrolled_from' | 'enrolled_until' | 'feature_designated_seat'> | null
}

export function normalizeDisplaySlotKey(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? ''
  return DISPLAY_SLOT_KEY_PATTERN.test(normalized) ? normalized : null
}

export function buildCourseDisplayPath(courseId: number) {
  return `/designated-seat-display/${courseId}`
}

export function buildSlotDisplayPath(slotKey: string) {
  return `/designated-seat-display/slot/${slotKey}`
}

export function buildMultiDisplayPath(slotKeys: string[]) {
  const uniqueKeys = (Array.from(new Set(slotKeys.map(normalizeDisplaySlotKey).filter(Boolean))) as string[])
    .slice(0, MAX_MULTI_DISPLAY_TARGETS)
  const query = uniqueKeys.length > 0 ? `?slots=${encodeURIComponent(uniqueKeys.join(','))}` : ''
  return `/designated-seat-display/multi${query}`
}

export function buildDisplayPathForTarget(target: DesignatedSeatDisplayTarget) {
  return target.mode === 'slot'
    ? buildSlotDisplayPath(target.slot.slot_key)
    : buildCourseDisplayPath(target.course.id)
}

export function buildDisplayUrlForTarget(origin: string, division: TenantType, target: DesignatedSeatDisplayTarget) {
  return `${origin}${withTenantPrefix(buildDisplayPathForTarget(target), division)}`
}

export async function getDisplaySlotByKey(slotKey: string, division: TenantType) {
  const normalized = normalizeDisplaySlotKey(slotKey)
  if (!normalized) {
    return null
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('course_seat_display_slots')
    .select('*')
    .eq('division', division)
    .eq('slot_key', normalized)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data as DesignatedSeatDisplaySlot | null) ?? null
}

export async function resolveDesignatedSeatDisplayTarget(input: {
  courseId?: number | null
  slotKey?: string | null
  division: TenantType
}) {
  if (input.slotKey) {
    const slot = await getDisplaySlotByKey(input.slotKey, input.division)
    if (!slot || !slot.course_id) {
      return null
    }

    const course = await getCourseById(slot.course_id, input.division)
    if (!course) {
      return null
    }

    return {
      mode: 'slot',
      course,
      slot,
    } satisfies DesignatedSeatDisplayTarget
  }

  if (!input.courseId) {
    return null
  }

  const course = await getCourseById(input.courseId, input.division)
  if (!course) {
    return null
  }

  return {
    mode: 'course',
    course,
    slot: null,
  } satisfies DesignatedSeatDisplayTarget
}

export async function listDisplaySlotsWithCourses(division: TenantType): Promise<DisplaySlotWithCourse[]> {
  const db = createServerClient()
  const { data, error } = await db
    .from('course_seat_display_slots')
    .select('*')
    .eq('division', division)
    .order('slot_key', { ascending: true })

  if (error) {
    throw error
  }

  const slots = ((data ?? []) as DesignatedSeatDisplaySlot[])
  const courseIds = Array.from(new Set(slots.map((slot) => slot.course_id).filter(Boolean))) as number[]
  const courseMap = new Map<number, DisplaySlotWithCourse['course']>()

  if (courseIds.length > 0) {
    const coursesResult = await db
      .from('courses')
      .select('id,name,status,enrolled_from,enrolled_until,feature_designated_seat')
      .in('id', courseIds)
      .eq('division', division)

    if (coursesResult.error) {
      throw coursesResult.error
    }

    for (const course of coursesResult.data ?? []) {
      courseMap.set(Number(course.id), course as DisplaySlotWithCourse['course'])
    }
  }

  return slots.map((slot) => ({
    ...slot,
    course: slot.course_id ? courseMap.get(slot.course_id) ?? null : null,
  }))
}
