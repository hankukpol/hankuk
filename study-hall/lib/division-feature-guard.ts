import { redirect } from "next/navigation";

import { DIVISION_FEATURES, type DivisionFeatureKey } from "@/lib/division-features";
import { getDivisionFeatureSettings } from "@/lib/services/settings.service";

function getDivisionFeatureLabel(featureKey: DivisionFeatureKey) {
  return DIVISION_FEATURES.find((feature) => feature.key === featureKey)?.label ?? "기능";
}

export async function redirectIfDivisionFeatureDisabled(
  divisionSlug: string,
  featureKey: DivisionFeatureKey,
  fallbackPath = `/${divisionSlug}/admin/settings/features`,
) {
  const settings = await getDivisionFeatureSettings(divisionSlug);

  if (!settings.featureFlags[featureKey]) {
    redirect(fallbackPath);
  }

  return settings;
}

export async function getDivisionFeatureDisabledError(
  divisionSlug: string,
  featureKey: DivisionFeatureKey,
) {
  const settings = await getDivisionFeatureSettings(divisionSlug);

  if (settings.featureFlags[featureKey]) {
    return null;
  }

  return `${getDivisionFeatureLabel(featureKey)} 기능이 현재 비활성화되어 있습니다.`;
}
