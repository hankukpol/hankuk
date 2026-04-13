import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { invalidateCache, type CacheTag } from '@/lib/cache/revalidate'

const schema = z.object({
  tag: z.enum([
    'all',
    'courses',
    'enrollments',
    'seats',
    'materials',
    'distribution-logs',
    'app-config',
  ]),
})

export async function POST(req: NextRequest) {
  const authError = await requireAdminApi(req)
  if (authError) {
    return authError
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid cache tag.' }, { status: 400 })
  }

  await invalidateCache(parsed.data.tag as CacheTag | 'all')
  return NextResponse.json({ success: true, tag: parsed.data.tag })
}
