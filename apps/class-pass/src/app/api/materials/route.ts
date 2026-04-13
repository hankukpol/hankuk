import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { invalidateCache } from '@/lib/cache/revalidate'
import { getCourseById, listMaterialsForCourse, verifyCourseOwnership } from '@/lib/class-pass-data'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'

const schema = z.object({
  courseId: z.number().int().positive(),
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(999).default(0),
})

export async function GET(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const courseId = Number(req.nextUrl.searchParams.get('courseId'))
  if (!Number.isInteger(courseId) || courseId <= 0) {
    return NextResponse.json({ error: 'courseId가 필요합니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  if (!(await verifyCourseOwnership(courseId, division))) {
    return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ materials: await listMaterialsForCourse(courseId) })
}

export async function POST(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_material_management_enabled')
  if (featureError) {
    return featureError
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '자료 생성 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const course = await getCourseById(parsed.data.courseId, division)
  if (!course) {
    return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('materials')
    .insert({
      course_id: parsed.data.courseId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      is_active: parsed.data.is_active,
      sort_order: parsed.data.sort_order,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: '자료를 생성하지 못했습니다.' }, { status: 500 })
  }

  await invalidateCache('materials')
  return NextResponse.json({ material: data }, { status: 201 })
}
