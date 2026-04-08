import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { normalizeName, normalizePhone } from '@/lib/utils'
import { invalidateCache } from '@/lib/cache/revalidate'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { withDivisionFallback, withStudentStatusFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import {
  ACTIVE_STUDENT_STATUS,
  REFUNDED_STUDENT_STATUS,
  applyLegacyStudentStatus,
  applyLegacyStudentStatusList,
} from '@/lib/student-status'
import { getServerTenantType } from '@/lib/tenant.server'

const studentSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  exam_number: z.string().optional().default(''),
  gender: z.string().optional().default(''),
  region: z.string().optional().default(''),
  series: z.string().optional().default(''),
})

type StudentPayload = {
  id: string
  name: string
  phone: string
  exam_number: string | null
  gender: string | null
  region: string | null
  series: string | null
}

type ExistingStudent = {
  id: string
  status: 'active' | 'refunded'
}

function buildStudentPayload(input: z.infer<typeof studentSchema>): StudentPayload {
  return {
    id: randomUUID(),
    name: normalizeName(input.name),
    phone: normalizePhone(input.phone),
    exam_number: input.exam_number || null,
    gender: input.gender || null,
    region: input.region || null,
    series: input.series || null,
  }
}

async function findStudentByIdentity(
  payload: Pick<StudentPayload, 'name' | 'phone'>,
  division: Awaited<ReturnType<typeof getServerTenantType>>,
) {
  const db = createServerClient()
  const scope = getScopedDivisionValues(division)

  return withStudentStatusFallback(
    () =>
      withDivisionFallback(
        () =>
          db
            .from('students')
            .select('id,status')
            .in('division', scope)
            .eq('name', payload.name)
            .eq('phone', payload.phone)
            .maybeSingle(),
        () =>
          db
            .from('students')
            .select('id,status')
            .eq('name', payload.name)
            .eq('phone', payload.phone)
            .maybeSingle(),
      ),
    async () => {
      const result = await withDivisionFallback(
        () =>
          db
            .from('students')
            .select('id')
            .in('division', scope)
            .eq('name', payload.name)
            .eq('phone', payload.phone)
            .maybeSingle(),
        () =>
          db
            .from('students')
            .select('id')
            .eq('name', payload.name)
            .eq('phone', payload.phone)
            .maybeSingle(),
      )

      return {
        ...result,
        data: result.data ? ({ ...result.data, status: ACTIVE_STUDENT_STATUS } as ExistingStudent) : null,
      }
    },
  ) as Promise<{ data: ExistingStudent | null; error: { code?: string; message?: string; details?: string; hint?: string } | null }>
}

async function restoreRefundedStudent(
  studentId: string,
  payload: StudentPayload,
  division: Awaited<ReturnType<typeof getServerTenantType>>,
) {
  const db = createServerClient()
  const update = {
    name: payload.name,
    phone: payload.phone,
    exam_number: payload.exam_number,
    gender: payload.gender,
    region: payload.region,
    series: payload.series,
    status: ACTIVE_STUDENT_STATUS,
    refunded_at: null,
    refund_note: null,
    updated_at: new Date().toISOString(),
  }

  return withDivisionFallback(
    () =>
      db
        .from('students')
        .update(update)
        .eq('id', studentId)
        .in('division', getScopedDivisionValues(division))
        .select()
        .single(),
    () =>
      db
        .from('students')
        .update(update)
        .eq('id', studentId)
        .select()
        .single(),
  )
}

export async function GET(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

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

  const buildQuery = (scoped: boolean, filterByStatus: boolean) => {
    let query = db
      .from('students')
      .select('*', { count: 'exact' })
      .order('name')

    if (scoped) {
      query = query.in('division', getScopedDivisionValues(division))
    }

    if (filterByStatus) {
      query = query.eq('status', ACTIVE_STUDENT_STATUS)
    }

    if (search) {
      const escaped = search.replace(/[%_\\]/g, '\\$&')
      query = query.or(`name.ilike.%${escaped}%,phone.ilike.%${escaped}%,exam_number.ilike.%${escaped}%`)
    }

    return query.range(offset, offset + limit - 1)
  }

  const { data, count, error } = await withStudentStatusFallback(
    () =>
      withDivisionFallback(
        () => buildQuery(true, true),
        () => buildQuery(false, true),
      ),
    () =>
      withDivisionFallback(
        () => buildQuery(true, false),
        () => buildQuery(false, false),
      ),
  )

  if (error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  return NextResponse.json({
    students: applyLegacyStudentStatusList(data as Array<Record<string, unknown>> | null | undefined),
    total: count,
  })
}

export async function POST(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

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
  const payload = buildStudentPayload(parsed.data)
  const existing = await findStudentByIdentity(payload, division)

  if (existing.error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  if (existing.data?.status === ACTIVE_STUDENT_STATUS) {
    return NextResponse.json(
      { error: '같은 학생 정보가 이미 등록되어 있습니다. 기존 학생 목록을 먼저 확인해 주세요.' },
      { status: 409 },
    )
  }

  if (existing.data?.status === REFUNDED_STUDENT_STATUS) {
    const { data, error } = await restoreRefundedStudent(existing.data.id, payload, division)

    if (error) {
      return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }

    await invalidateCache('students')
    return NextResponse.json({ student: data, created: 0, restored: 1 })
  }

  const { data, error } = await withStudentStatusFallback(
    () =>
      withDivisionFallback(
        () =>
          db
            .from('students')
            .insert({ ...payload, division, status: ACTIVE_STUDENT_STATUS })
            .select()
            .single(),
        () =>
          db
            .from('students')
            .insert({ ...payload, status: ACTIVE_STUDENT_STATUS })
            .select()
            .single(),
      ),
    () =>
      withDivisionFallback(
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
      ),
  )

  if (error) {
    console.error('[students:POST] failed to insert student', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    })

    if (error.code === '23505') {
      return NextResponse.json(
        { error: '같은 학생 정보가 이미 등록되어 있습니다. 기존 학생 목록을 먼저 확인해 주세요.' },
        { status: 409 },
      )
    }

    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  await invalidateCache('students')
  return NextResponse.json({ student: applyLegacyStudentStatus(data), created: 1, restored: 0 }, { status: 201 })
}
