import { NextRequest, NextResponse } from 'next/server'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
import { getCourseById } from '@/lib/class-pass-data'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'
import type { Course } from '@/types/database'

function parseTemplateCourse(data: unknown, division: string): Course | null {
  const candidate = Array.isArray(data) ? data[0] : data
  if (!candidate || typeof candidate !== 'object') {
    return null
  }

  const row = candidate as Record<string, unknown>
  return (
    typeof row.id === 'number'
    && Number.isInteger(row.id)
    && row.id > 0
    && row.division === division
    && typeof row.name === 'string'
    && typeof row.slug === 'string'
    && row.status === 'archived'
  )
    ? candidate as Course
    : null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_course_management_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const courseId = parsePositiveInt(id)
  if (!courseId) {
    return NextResponse.json({ error: '잘못된 강좌 ID입니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const sourceCourse = await getCourseById(courseId, division)
  if (!sourceCourse) {
    return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
  }

  const db = createServerClient()
  const { data, error } = await db.rpc('copy_course_template', {
    p_source_course_id: courseId,
    p_target_division: division,
  })

  if (error) {
    console.error('Failed to copy course template.', {
      courseId,
      division,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    })
    return NextResponse.json({ error: '강좌 템플릿을 복사하지 못했습니다.' }, { status: 500 })
  }

  const course = parseTemplateCourse(data, division)
  if (!course) {
    console.error('Course template copy returned an invalid course.', {
      courseId,
      division,
      data,
    })
    return NextResponse.json({ error: '복사된 강좌 템플릿 정보를 확인하지 못했습니다.' }, { status: 500 })
  }

  try {
    await Promise.all([
      invalidateCache('courses'),
      invalidateCache('course-subjects'),
      invalidateCache('designated-seats'),
    ])
  } catch (cacheError) {
    console.error('Course template was copied, but cache invalidation failed.', {
      courseId,
      copiedCourseId: course.id,
      division,
      error: cacheError,
    })
  }

  return NextResponse.json(
    {
      course,
      copied: {
        fromCourseId: sourceCourse.id,
        fromCourseName: sourceCourse.name,
      },
    },
    { status: 201 },
  )
}
