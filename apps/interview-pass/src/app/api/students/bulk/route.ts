import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { normalizePhone, normalizeName } from '@/lib/utils'
import { invalidateCache } from '@/lib/cache/revalidate'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { withDivisionFallback } from '@/lib/division-compat'
import { getServerTenantType } from '@/lib/tenant.server'

const rowSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  exam_number: z.string().optional().default(''),
  gender: z.string().optional().default(''),
  region: z.string().optional().default(''),
  series: z.string().optional().default(''),
})

const bulkSchema = z.array(rowSchema).min(1).max(500)

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
  const parsed = bulkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  const rows = parsed.data
    .map((row) => ({
      id: randomUUID(),
      name: normalizeName(row.name),
      phone: normalizePhone(row.phone),
      exam_number: row.exam_number || null,
      gender: row.gender || null,
      region: row.region || null,
      series: row.series || null,
    }))
    .filter((row) => row.name && row.phone)

  const db = createServerClient()
  const division = await getServerTenantType()
  const { data, error } = await withDivisionFallback(
    () =>
      db
        .from('students')
        .upsert(
          rows.map((row) => ({ ...row, division })),
          { onConflict: 'division,name,phone', ignoreDuplicates: true },
        )
        .select(),
    () =>
      db
        .from('students')
        .upsert(rows, { onConflict: 'name,phone', ignoreDuplicates: true })
        .select(),
  )

  if (error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  const inserted = data?.length ?? 0
  const skipped = rows.length - inserted
  await invalidateCache('students')
  return NextResponse.json({ inserted, skipped, total: rows.length })
}
