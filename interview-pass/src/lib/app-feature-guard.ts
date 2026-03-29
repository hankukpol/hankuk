import { NextResponse } from 'next/server'
import { isAppFeatureEnabled } from '@/lib/app-config'
import { APP_FEATURE_META, type AppFeatureKey } from '@/lib/app-config.shared'

export async function requireAppFeature(feature: AppFeatureKey) {
  if (await isAppFeatureEnabled(feature)) {
    return null
  }

  return NextResponse.json(
    { error: APP_FEATURE_META[feature].disabledMessage },
    { status: 403 },
  )
}
