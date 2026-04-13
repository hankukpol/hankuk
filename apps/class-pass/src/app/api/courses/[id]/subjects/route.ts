import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { invalidateCache } from '@/lib/cache/revalidate'
import { getCourseById, listCourseSubjects, verifyCourseOwnership } from '@/lib/class-pass-data'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { createServerClient } from '@/lib/supabase/server'
import { getServerTenantType } from '@/lib/tenant.server'
import { normalizeName, parsePositiveInt } from '@/lib/utils'

const createSchema = z.object({
  name: z.string().min(1).max(50),
  sort_order: z.number().int().min(0).max(999).optional(),
})

const patchSchema = z.object({
  subjectId: z.number().int().positive(),
  name: z.string().min(1).max(50).optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
})

const deleteSchema = z.object({
  subjectId: z.number().int().positive(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const { id } = await params
  const courseId = parsePositiveInt(id)
  if (!courseId) {
    return NextResponse.json({ error: '잘못된 강좌 ID입니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  if (!(await verifyCourseOwnership(courseId, division))) {
    return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ subjects: await listCourseSubjects(courseId) })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_seat_management_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const courseId = parsePositiveInt(id)
  if (!courseId) {
    return NextResponse.json({ error: '잘못된 강좌 ID입니다.' }, { status: 400 })
  }

  const division = await getServerTenantType()
  const course = await getCourseById(courseId, division)
  if (!course) {
    return NextResponse.json({ error: '강좌를 찾을 수 없습니다.' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '과목 생성 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const currentSubjects = await listCourseSubjects(courseId)
  const nextSortOrder = parsed.data.sort_order ?? currentSubjects.length
  const db = createServerClient()
  const { data, error } = await db
    .from('course_subjects')
    .insert({
      course_id: courseId,
      name: normalizeName(parsed.data.name),
      sort_order: nextSortOrder,
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '같은 강좌 안에 동일한 과목명이 이미 존재합니다.' }, { status: 409 })
    }

    return NextResponse.json({ error: '과목을 생성하지 못했습니다.' }, { status: 500 })
  }

  await invalidateCache('seats')
  return NextResponse.json({ subject: data }, { status: 201 })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_seat_management_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const courseId = parsePositiveInt(id)
  if (!courseId) {
    return NextResponse.json({ error: '잘못된 강좌 ID입니다.' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '과목 수정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const db = createServerClient()
  const { data, error } = await db
    .from('course_subjects')
    .update({
      ...(parsed.data.name ? { name: normalizeName(parsed.data.name) } : {}),
      ...(parsed.data.sort_order !== undefined ? { sort_order: parsed.data.sort_order } : {}),
    })
    .eq('id', parsed.data.subjectId)
    .eq('course_id', courseId)
    .select('*')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: '과목을 수정하지 못했습니다.' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ error: '과목을 찾을 수 없습니다.' }, { status: 404 })
  }

  await invalidateCache('seats')
  return NextResponse.json({ subject: data })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_seat_management_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const courseId = parsePositiveInt(id)
  if (!courseId) {
    return NextResponse.json({ error: '잘못된 강좌 ID입니다.' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '삭제할 과목 ID가 필요합니다.' }, { status: 400 })
  }

  const db = createServerClient()
  const { error } = await db
    .from('course_subjects')
    .delete()
    .eq('id', parsed.data.subjectId)
    .eq('course_id', courseId)

  if (error) {
    return NextResponse.json({ error: '과목을 삭제하지 못했습니다.' }, { status: 500 })
  }

  await invalidateCache('seats')
  return NextResponse.json({ success: true })
}
