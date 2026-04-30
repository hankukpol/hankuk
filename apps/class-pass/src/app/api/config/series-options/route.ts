import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAppFeature } from '@/lib/app-feature-guard'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { listBranchSeriesOptions, saveBranchSeriesOptions } from '@/lib/branch-series'

const optionSchema = z.object({
  id: z.number().int().positive().optional().nullable(),
  group_key: z.enum(['public', 'career']),
  label: z.string().trim().min(1).max(40),
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional(),
  display_order: z.number().int().min(-1000).max(10000).optional().nullable(),
})

const patchSchema = z.object({
  options: z.array(optionSchema).min(1).max(30),
})

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  try {
    return NextResponse.json({
      options: await listBranchSeriesOptions({ includeInactive: true }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '직렬 설정을 불러오지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const featureError = await requireAppFeature('admin_config_enabled')
  if (featureError) {
    return featureError
  }

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '직렬 설정 요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  try {
    return NextResponse.json({
      options: await saveBranchSeriesOptions(parsed.data.options),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '직렬 설정을 저장하지 못했습니다.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
