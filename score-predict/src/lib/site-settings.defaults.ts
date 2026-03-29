import { SITE_SETTING_DEFAULTS as FIRE_SITE_SETTING_DEFAULTS, type SiteSettingsMap } from "@/lib/site-settings.constants";
import { SITE_SETTING_DEFAULTS as POLICE_SITE_SETTING_DEFAULTS } from "@/lib/police/site-settings.constants";
import type { TenantType } from "@/lib/tenant";

const MERGED_POLICE_SITE_SETTING_DEFAULTS: SiteSettingsMap = {
  ...FIRE_SITE_SETTING_DEFAULTS,
  ...(POLICE_SITE_SETTING_DEFAULTS as Partial<SiteSettingsMap>),
};

export function getTenantSiteSettingDefaults(tenantType: TenantType): SiteSettingsMap {
  return tenantType === "police"
    ? { ...MERGED_POLICE_SITE_SETTING_DEFAULTS }
    : { ...FIRE_SITE_SETTING_DEFAULTS };
}
