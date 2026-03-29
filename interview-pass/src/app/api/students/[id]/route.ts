import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { normalizePhone, normalizeName } from '@/lib/utils'
import { invalidateCache } from '@/lib/cache/revalidate'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { withDivisionFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { getServerTenantType } from '@/lib/tenant.server'

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(10).optional(),
  exam_number: z.string().optional(),
  gender: z.string().optional(),
  region: z.string().optional(),
  series: z.string().optional(),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const featureError = await requireAppFeature('admin_student_management_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const division = await getServerTenantType()
  const db = createServerClient()
  const scope = getScopedDivisionValues(division)

  const { data: student, error } = await withDivisionFallback(
    () =>
      db
        .from('students')
        .select('*')
        .eq('id', id)
        .in('division', scope)
        .maybeSingle(),
    () =>
      db
        .from('students')
        .select('*')
        .eq('id', id)
        .maybeSingle(),
  )

  if (error || !student) {
    return NextResponse.json({ error: '학생을 찾을 수 없습니다.' }, { status: 404 })
  }

  const { data: logs } = await withDivisionFallback(
    () =>
      db
        .from('distribution_logs')
        .select('id, material_id, distributed_at, materials(name)')
        .eq('student_id', id)
        .in('division', scope)
        .order('distributed_at', { ascending: false }),
    () =>
      db
        .from('distribution_logs')
        .select('id, material_id, distributed_at, materials(name)')
        .eq('student_id', id)
        .order('distributed_at', { ascending: false }),
  )

  return NextResponse.json({
    student: {
      ...student,
      distribution_logs: logs ?? [],
    },
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const featureError = await requireAppFeature('admin_student_management_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const division = await getServerTenantType()
  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.name) update.name = normalizeName(parsed.data.name)
  if (parsed.data.phone) update.phone = normalizePhone(parsed.data.phone)
  if (parsed.data.exam_number !== undefined) update.exam_number = parsed.data.exam_number || null
  if (parsed.data.gender !== undefined) update.gender = parsed.data.gender || null
  if (parsed.data.region !== undefined) update.region = parsed.data.region || null
  if (parsed.data.series !== undefined) update.series = parsed.data.series || null

  const db = createServerClient()
  const { data, error } = await withDivisionFallback(
    () =>
      db
        .from('students')
        .update(update)
        .eq('id', id)
        .in('division', getScopedDivisionValues(division))
        .select()
        .single(),
    () =>
      db
        .from('students')
        .update(update)
        .eq('id', id)
        .select()
        .single(),
  )

  if (error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  await invalidateCache('students')
  return NextResponse.json({ student: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const featureError = await requireAppFeature('admin_student_management_enabled')
  if (featureError) {
    return featureError
  }

  const { id } = await params
  const division = await getServerTenantType()
  const db = createServerClient()
  const { error } = await withDivisionFallback(
    () =>
      db
        .from('students')
        .delete()
        .eq('id', id)
        .in('division', getScopedDivisionValues(division)),
    () =>
      db
        .from('students')
        .delete()
        .eq('id', id),
  )

  if (error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  await invalidateCache('students')
  return NextResponse.json({ success: true })
}
