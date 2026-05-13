import 'server-only'

import { listCourseEnrollmentsPaged, getCourseById } from '@/lib/class-pass-data'
import { normalizeGenderLabel } from '@/lib/gender'
import type { TenantType } from '@/lib/tenant'
import { ENROLLMENT_STUDENT_TYPE_LABEL, type Enrollment } from '@/types/database'

export type AnalyticsBucket = {
  label: string
  count: number
}

type AnalyticsEnrollmentRow = {
  cohort_label: string | null
  gender: string | null
  series_label: string | null
  student_type: string
  student_type_label: string
}

export type CourseAnalyticsResult = {
  course: {
    id: number
    name: string
    slug: string
  }
  total: number
  missing: {
    cohort: number
    gender: number
    series: number
  }
  cohort: AnalyticsBucket[]
  gender: AnalyticsBucket[]
  series: AnalyticsBucket[]
  studentType: AnalyticsBucket[]
}

const MISSING_LABEL = '미입력'

function valueOrMissing(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized || MISSING_LABEL
}

function getSeriesLabel(enrollment: Enrollment) {
  return enrollment.series?.trim() || (enrollment.series_group === 'career' ? '경채' : '공채')
}

function bucketize(
  rows: AnalyticsEnrollmentRow[],
  getValue: (row: AnalyticsEnrollmentRow) => string | null | undefined,
  options: { includeMissing?: boolean } = {},
) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const label = valueOrMissing(getValue(row))
    if (!options.includeMissing && label === MISSING_LABEL) {
      continue
    }
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => {
      if (left.label === MISSING_LABEL) return 1
      if (right.label === MISSING_LABEL) return -1
      return right.count - left.count || left.label.localeCompare(right.label, 'ko', { numeric: true })
    })
}

export async function getCourseAnalytics(
  courseId: number,
  division: TenantType,
): Promise<CourseAnalyticsResult | null> {
  const course = await getCourseById(courseId, division)
  if (!course || course.status !== 'active') {
    return null
  }

  const { enrollments } = await listCourseEnrollmentsPaged(courseId, {
    status: 'active',
    noLimit: true,
  })
  const activeEnrollments = enrollments.filter((enrollment) => (
    enrollment.status === 'active' && !enrollment.suspended_at
  ))

  const rows = activeEnrollments.map((enrollment): AnalyticsEnrollmentRow => {
    const studentType = enrollment.student_type ?? 'general'
    return {
      cohort_label: enrollment.cohort_label ?? null,
      gender: normalizeGenderLabel(enrollment.gender) || null,
      series_label: getSeriesLabel(enrollment),
      student_type: studentType,
      student_type_label: ENROLLMENT_STUDENT_TYPE_LABEL[studentType],
    }
  })

  return {
    course: {
      id: course.id,
      name: course.name,
      slug: course.slug,
    },
    total: rows.length,
    missing: {
      cohort: rows.filter((row) => !row.cohort_label?.trim()).length,
      gender: rows.filter((row) => !row.gender?.trim()).length,
      series: rows.filter((row) => !row.series_label?.trim()).length,
    },
    cohort: bucketize(rows, (row) => row.cohort_label),
    gender: bucketize(rows, (row) => row.gender, { includeMissing: true }),
    series: bucketize(rows, (row) => row.series_label, { includeMissing: true }),
    studentType: bucketize(rows, (row) => row.student_type_label, { includeMissing: true }),
  }
}
