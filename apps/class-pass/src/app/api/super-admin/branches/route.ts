import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateSuperAdminRequest } from '@/lib/auth/authenticate'
import { isBranchSlugError, listBranches, upsertBranch } from '@/lib/branch-ops'

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1).max(80),
  track_type: z.enum(['police', 'fire']),
  description: z.string().max(300).optional(),
  admin_title: z.string().max(80).optional(),
  series_label: z.string().max(20).optional(),
  region_label: z.string().max(20).optional(),
  app_name: z.string().max(50).optional(),
  theme_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  is_active: z.boolean().optional(),
  display_order: z.number().int().min(0).max(999).optional(),
})

export async function GET(req: NextRequest) {
  const { error } = await authenticateSuperAdminRequest(req)
  if (error) {
    return error
  }

  const branches = await listBranches()
  return NextResponse.json({ branches })
}

export async function POST(req: NextRequest) {
  const { error } = await authenticateSuperAdminRequest(req)
  if (error) {
    return error
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '지점 정보가 올바르지 않습니다.' }, { status: 400 })
  }

  try {
    const branch = await upsertBranch(parsed.data)
    return NextResponse.json({ branch }, { status: 201 })
  } catch (error) {
    if (isBranchSlugError(error, 'missing') || isBranchSlugError(error, 'invalid')) {
      return NextResponse.json(
        { error: '지점 slug는 영문 소문자, 숫자, 하이픈(-)만 사용할 수 있습니다.' },
        { status: 400 },
      )
    }

    if (isBranchSlugError(error, 'reserved')) {
      return NextResponse.json(
        { error: '해당 slug는 시스템 경로로 예약되어 있어 지점 slug로 사용할 수 없습니다.' },
        { status: 400 },
      )
    }

    throw error
  }
}
