import { slugifyCourseName } from '@/lib/utils'

export const COURSE_SLUG_MAX_LENGTH = 100

type CourseSlugUpdateDecision =
  | { type: 'reject-active-change' }
  | { type: 'regenerate' }
  | { type: 'use'; slug: string }

export function decideCourseSlugUpdate(params: {
  currentName: string
  currentSlug: string
  currentStatus: 'active' | 'archived'
  copiedAt: string | null
  nextName: string
  nextStatus: 'active' | 'archived'
  requestedSlug: string | undefined
}): CourseSlugUpdateDecision {
  if (
    (params.currentStatus === 'active' || params.nextStatus === 'active')
    && params.requestedSlug !== undefined
    && params.requestedSlug !== params.currentSlug
  ) {
    return { type: 'reject-active-change' }
  }

  if (
    params.currentStatus === 'archived'
    && Boolean(params.copiedAt)
    && params.nextName !== params.currentName
  ) {
    return { type: 'regenerate' }
  }

  return {
    type: 'use',
    slug: params.requestedSlug === undefined
      ? params.currentSlug
      : params.requestedSlug || slugifyCourseName(params.nextName),
  }
}

export function buildCourseSlugCandidate(params: {
  courseName: string
  courseId: number
  sequence: number
}) {
  const baseSlug = slugifyCourseName(params.courseName) || `course-${params.courseId}`
  const suffix = params.sequence > 1 ? `-${params.sequence}` : ''
  const availableBaseLength = COURSE_SLUG_MAX_LENGTH - suffix.length

  return `${baseSlug.slice(0, availableBaseLength)}${suffix}`
}
