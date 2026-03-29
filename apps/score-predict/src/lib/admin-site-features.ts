import { NextResponse } from "next/server";
import {
  ADMIN_SITE_FEATURES,
  resolveAdminSiteFeatureState,
  type AdminSiteFeatureKey,
} from "@/lib/admin-site-features.shared";
import { getSiteSettingsUncached } from "@/lib/site-settings";

export async function isAdminSiteFeatureEnabled(
  feature: AdminSiteFeatureKey
): Promise<boolean> {
  const settings = await getSiteSettingsUncached();
  const featureState = resolveAdminSiteFeatureState(settings);
  return featureState[feature];
}

export async function requireAdminSiteFeature(
  feature: AdminSiteFeatureKey
): Promise<NextResponse | null> {
  const enabled = await isAdminSiteFeatureEnabled(feature);
  if (enabled) {
    return null;
  }

  const featureMeta = ADMIN_SITE_FEATURES[feature];
  return NextResponse.json(
    {
      error: `${featureMeta.label} 기능이 현재 비활성화되어 있습니다.`,
      feature: feature,
    },
    { status: 403 }
  );
}
