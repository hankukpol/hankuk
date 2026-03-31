import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase/server'
import { invalidateCache } from '@/lib/cache/revalidate'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { withDivisionFallback } from '@/lib/division-compat'
import { getScopedDivisionValues } from '@/lib/division-scope'
import { getServerTenantType } from '@/lib/tenant.server'

function logMaterialsRouteError(context: string, error: {
  code?: string
  message?: string
  details?: string
  hint?: string
}) {
  console.error(`[materials:${context}]`, {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  })
}

const getActiveMaterials = unstable_cache(
  async (division: 'police' | 'fire') => {
    const db = createServerClient()
    const result = await withDivisionFallback(
      () =>
        db
          .from('materials')
          .select('*')
          .in('division', getScopedDivisionValues(division))
          .eq('is_active', true)
          .order('sort_order'),
      () => db.from('materials').select('*').eq('is_active', true).order('sort_order'),
    )
    return result.data ?? []
  },
  ['materials-active'],
  { tags: ['materials'], revalidate: 300 },
)

const getAllMaterials = unstable_cache(
  async (division: 'police' | 'fire') => {
    const db = createServerClient()
    const result = await withDivisionFallback(
      () =>
        db
          .from('materials')
          .select('*')
          .in('division', getScopedDivisionValues(division))
          .order('sort_order'),
      () => db.from('materials').select('*').order('sort_order'),
    )
    return result.data ?? []
  },
  ['materials-all'],
  { tags: ['materials'], revalidate: 300 },
)

export async function GET(req: NextRequest) {
  const all = req.nextUrl.searchParams.get('all') === '1'
  const division = await getServerTenantType()

  if (all) {
    const authError = await requireAdminApi(req)
    if (authError) {
      return authError
    }

    const featureError = await requireAppFeature('admin_materials_enabled')
    if (featureError) {
      return featureError
    }
  }

  const materials = all ? await getAllMaterials(division) : await getActiveMaterials(division)
  return NextResponse.json({ materials })
}

export async function POST(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_materials_enabled')
  if (featureError) {
    return featureError
  }

  const schema = z.object({
    name: z.string().min(1),
    description: z.string().default(''),
    is_active: z.boolean().default(true),
    sort_order: z.number().int().min(0).max(99).default(0),
  })

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }

  const db = createServerClient()
  const division = await getServerTenantType()
  const { data, error } = await withDivisionFallback(
    () =>
      db
        .from('materials')
        .insert({ ...parsed.data, division })
        .select()
        .single(),
    () =>
      db
        .from('materials')
        .insert(parsed.data)
        .select()
        .single(),
  )

  if (error) {
    logMaterialsRouteError('POST', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }

  await invalidateCache('materials')
  return NextResponse.json({ material: data }, { status: 201 })
}
