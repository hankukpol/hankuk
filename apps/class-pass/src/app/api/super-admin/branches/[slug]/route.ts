import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateSuperAdminRequest } from '@/lib/auth/authenticate'
import { getBranchBySlug, upsertBranch } from '@/lib/branch-ops'

const schema = z.object({
  name: z.string().min(1).max(80).optional(),
  track_type: z.enum(['police', 'fire']).optional(),
  description: z.string().max(300).optional(),
  admin_title: z.string().max(80).optional(),
  series_label: z.string().max(20).optional(),
  region_label: z.string().max(20).optional(),
  app_name: z.string().max(50).optional(),
  theme_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  is_active: z.boolean().optional(),
  display_order: z.number().int().min(0).max(999).optional(),
})

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { error } = await authenticateSuperAdminRequest(req)
  if (error) {
    return error
  }

  const { slug } = await context.params
  const existing = await getBranchBySlug(slug)
  if (!existing) {
    return NextResponse.json({ error: '지점을 찾을 수 없습니다.' }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '지점 수정 정보가 올바르지 않습니다.' }, { status: 400 })
  }

  const branch = await upsertBranch({
    slug: existing.slug,
    name: parsed.data.name ?? existing.name,
    track_type: parsed.data.track_type ?? existing.track_type,
    description: parsed.data.description ?? existing.description,
    admin_title: parsed.data.admin_title ?? existing.admin_title,
    series_label: parsed.data.series_label ?? existing.series_label,
    region_label: parsed.data.region_label ?? existing.region_label,
    app_name: parsed.data.app_name ?? existing.app_name,
    theme_color: parsed.data.theme_color ?? existing.theme_color,
    is_active: parsed.data.is_active ?? existing.is_active,
    display_order: parsed.data.display_order ?? existing.display_order,
  })

  return NextResponse.json({ branch })
}
