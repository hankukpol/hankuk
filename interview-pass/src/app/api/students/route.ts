import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { normalizePhone, normalizeName } from '@/lib/utils'
import { invalidateCache } from '@/lib/cache/revalidate'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { withDivisionFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { getServerTenantType } from '@/lib/tenant.server'

const studentSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  exam_number: z.string().optional().default(''),
  gender: z.string().optional().default(''),
  region: z.string().optional().default(''),
  series: z.string().optional().default(''),
})

export async function GET(req: NextRequest) {
  const featureError = await requireAppFeature('admin_student_management_enabled')
  if (featureError) {
    return featureError
  }

  const sp = req.nextUrl.searchParams
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '20', 10) || 20))
  const search = sp.get('search') ?? ''
  const offset = (page - 1) * limit

  const db = createServerClient()
  const division = await getServerTenantType()

  const buildQuery = (scoped: boolean) => {
    let query = db.from('students').select('*', { count: 'exact' }).order('name')
    if (scoped) {
      query = query.in('division', getScopedDivisionValues(division))
    }
    if (search) {
      const escaped = search.replace(/[%_\\]/g, '\\$&')
      query = query.or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%,exam_number.ilike.%${escaped}%`)
    }
    return query.range(offset, offset + limit - 1)
  }

  const { data, count, error } = await withDivisionFallback(
    () => buildQuery(true),
    () => buildQuery(false),
  )

  if (error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ students: data, total: count })
}

export async function POST(req: NextRequest) {
  const featureError = await requireAppFeature('admin_student_management_enabled')
  if (featureError) {
    return featureError
  }

  const body = await req.json().catch(() => null)
  const parsed = studentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  const db = createServerClient()
  const division = await getServerTenantType()
  const payload = {
    name: normalizeName(parsed.data.name),
    phone: normalizePhone(parsed.data.phone),
    exam_number: parsed.data.exam_number || null,
    gender: parsed.data.gender || null,
    region: parsed.data.region || null,
    series: parsed.data.series || null,
  }

  const { data, error } = await withDivisionFallback(
    () =>
      db
        .from('students')
        .insert({ ...payload, division })
        .select()
        .single(),
    () =>
      db
        .from('students')
        .insert(payload)
        .select()
        .single(),
  )

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: '같은 학생 정보가 이미 등록되어 있습니다. 기존 학생 목록을 먼저 확인해 주세요.' },
        { status: 409 },
      )
    }

    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  await invalidateCache('students')
  return NextResponse.json({ student: data }, { status: 201 })
}
