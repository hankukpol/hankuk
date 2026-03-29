import { NextRequest, NextResponse } from 'next/server'
import { invalidateCache } from '@/lib/cache/revalidate'
import { requireAdminApi } from '@/lib/auth/require-admin-api'
import { requireAppFeature } from '@/lib/app-feature-guard'

export async function POST(req: NextRequest) {
  const guard = await requireAdminApi(req)
  if (guard) return guard

  const featureError = await requireAppFeature('admin_cache_tools_enabled')
  if (featureError) return featureError

  invalidateCache('all')
  return NextResponse.json({ ok: true, message: '캐시가 초기화되었습니다.' })
}
