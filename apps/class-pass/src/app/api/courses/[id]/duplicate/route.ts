import { NextRequest, NextResponse } from 'next/server'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache } from '@/lib/cache/revalidate'
import { getCourseById } from '@/lib/class-pass-data'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { parsePositiveInt } from '@/lib/utils'

function parseDuplicatedCourseId(data: unknown): number | null {
  if (typeof data === 'number' && Number.isInteger(data) && data > 0) {
    return data
  }

  if (typeof data === 'string') {
    const value = Number(data)
    if (Number.isInteger(value) && value > 0) {
      return value
    }
  }

  if (Array.isArray(data) && data.length > 0) {
    return parseDuplicatedCourseId(data[0])
  }

  if (data && typeof data === 'object') {
    for (const value of Object.values(data)) {
      const parsed: number | null = parseDuplicatedCourseId(value)
      if (parsed) {
        return parsed
      }
    }
  }

  return null
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
  const { data, error } = await db.rpc('duplicate_course_settings', {
    p_source_course_id: courseId,
    p_target_division: division,
  })

  if (error) {
    return NextResponse.json({ error: '강좌 복사본을 생성하지 못했습니다.' }, { status: 500 })
  }

  const duplicatedCourseId = parseDuplicatedCourseId(data)
  if (!duplicatedCourseId) {
    return NextResponse.json({ error: '복사된 강좌 정보를 확인하지 못했습니다.' }, { status: 500 })
  }

  const course = await getCourseById(duplicatedCourseId, division)
  if (!course) {
    return NextResponse.json({ error: '복사된 강좌를 불러오지 못했습니다.' }, { status: 500 })
  }

  await invalidateCache('courses')

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
