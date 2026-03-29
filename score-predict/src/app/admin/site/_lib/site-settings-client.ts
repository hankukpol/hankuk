import { SITE_SETTING_DEFAULTS } from "@/lib/site-settings.constants";
import type { SiteSettingsSectionKey } from "./site-settings-sections";

export type SettingValue = string | boolean | number | null;
export type SiteSettingsMap = Record<string, SettingValue>;
export const ADMIN_SITE_SETTINGS_UPDATED_EVENT = "admin-site-settings-updated";

export type AutoPassCutMode = "HYBRID" | "TRAFFIC_ONLY" | "CRON_ONLY";
export type AutoPassCutProfile = "BALANCED" | "CONSERVATIVE" | "AGGRESSIVE";

interface SiteSettingsResponse {
  settings?: SiteSettingsMap;
  error?: string;
}

interface SaveResponse {
  success?: boolean;
  error?: string;
}

function buildSiteSettingsUrl(section?: SiteSettingsSectionKey) {
  if (!section) {
    return "/api/admin/site";
  }

  const params = new URLSearchParams({ section });
  return `/api/admin/site?${params.toString()}`;
}

export async function loadSettings(section?: SiteSettingsSectionKey): Promise<SiteSettingsMap> {
  const response = await fetch(buildSiteSettingsUrl(section), {
    method: "GET",
    cache: "no-store",
  });
  const data = (await response.json()) as SiteSettingsResponse;

  if (!response.ok) {
    throw new Error(data.error ?? "사이트 설정을 불러오지 못했습니다.");
  }

  return { ...SITE_SETTING_DEFAULTS, ...(data.settings ?? {}) };
}

export async function saveSettings(
  payload: SiteSettingsMap,
  section: SiteSettingsSectionKey
): Promise<void> {
  const response = await fetch(buildSiteSettingsUrl(section), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settings: payload }),
  });

  const data = (await response.json()) as SaveResponse;
  if (!response.ok || !data.success) {
    throw new Error(data.error ?? "설정 저장에 실패했습니다.");
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ADMIN_SITE_SETTINGS_UPDATED_EVENT));
  }
}

export function asString(value: SettingValue, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asBoolean(value: SettingValue, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function asNumber(value: SettingValue, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

export function normalizeMode(value: string): AutoPassCutMode {
  const normalized = value.trim().toUpperCase();
  if (normalized === "TRAFFIC_ONLY") return "TRAFFIC_ONLY";
  if (normalized === "CRON_ONLY") return "CRON_ONLY";
  return "HYBRID";
}

export function normalizeProfile(value: string): AutoPassCutProfile {
  const normalized = value.trim().toUpperCase();
  if (normalized === "CONSERVATIVE") return "CONSERVATIVE";
  if (normalized === "AGGRESSIVE") return "AGGRESSIVE";
  return "BALANCED";
}
