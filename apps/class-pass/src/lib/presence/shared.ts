import type { Course } from '@/types/database'

export type PresenceFeature = 'attendance' | 'designated_seat'

type PresenceCourse = Pick<
  Course,
  | 'presence_location_enabled'
  | 'presence_enforcement_mode'
  | 'presence_required_for_attendance'
  | 'presence_required_for_designated_seat'
>

export function isPresenceLocationFeatureActive(course: Partial<PresenceCourse>, feature: PresenceFeature) {
  if (!course.presence_location_enabled) {
    return false
  }

  return feature === 'attendance'
    ? Boolean(course.presence_required_for_attendance)
    : Boolean(course.presence_required_for_designated_seat)
}

export function isPresenceLocationEnforced(course: Partial<PresenceCourse>, feature: PresenceFeature) {
  return isPresenceLocationFeatureActive(course, feature)
    && (course.presence_enforcement_mode ?? 'monitor') === 'enforce'
}
