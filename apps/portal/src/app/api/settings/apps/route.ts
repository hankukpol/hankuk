import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { requirePortalApiSuperAdmin } from '@/lib/portal-route-auth'
import { listSettingsApps, updateAppDisplayNames } from '@/lib/staff-management'
import { updateAppNamesSchema } from '@/lib/validations/settings'

export async function GET() {
  const auth = await requirePortalApiSuperAdmin()
  if (auth.response) {
    return auth.response
  }

  try {
    const apps = await listSettingsApps()
    return NextResponse.json({ apps })
  } catch (error) {
    console.error('[portal-settings] failed to load apps.', error)
    return NextResponse.json({ error: '설정 정보를 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requirePortalApiSuperAdmin()
  if (auth.response || !auth.session) {
    return auth.response
  }

  try {
    const body = await request.json().catch(() => null)
    const parsed = updateAppNamesSchema.parse(body)
    const apps = await updateAppDisplayNames(auth.session.userId, parsed.apps)
    return NextResponse.json({ apps })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: '유효하지 않은 입력입니다.', details: error.flatten() },
        { status: 400 },
      )
    }

    console.error('[portal-settings] failed to update apps.', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '앱 이름을 저장하지 못했습니다.' },
      { status: 500 },
    )
  }
}
