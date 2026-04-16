import { NextResponse } from 'next/server'
import { requirePortalApiSuperAdmin } from '@/lib/portal-route-auth'
import { listStaffAppOptions } from '@/lib/staff-management'

export async function GET() {
  const auth = await requirePortalApiSuperAdmin()
  if (auth.response) {
    return auth.response
  }

  try {
    const apps = await listStaffAppOptions()
    return NextResponse.json({ apps })
  } catch (error) {
    console.error('[portal-staff] failed to load app options.', error)
    return NextResponse.json({ error: '앱 옵션을 불러오지 못했습니다.' }, { status: 500 })
  }
}
