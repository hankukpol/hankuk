import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { getPrismaClientForTenant, prisma, withPrismaConnectionRetry } from "@/lib/prisma";
import { getTenantSiteSettingDefaults } from "@/lib/site-settings.defaults";
import {
  SITE_SETTING_TYPES,
  type SiteSettingKey,
  type SiteSettingsMap,
} from "@/lib/site-settings.constants";
import type { TenantType } from "@/lib/tenant";
import { getServerTenantType } from "@/lib/tenant.server";

export interface PublicNoticeItem {
  id: number;
  title: string;
  content: string;
  priority: number;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const SITE_SETTINGS_TAG = "site-settings";
const ACTIVE_NOTICES_TAG = "active-notices";

function isSiteSettingKey(key: string): key is SiteSettingKey {
  return key in SITE_SETTING_TYPES;
}

function toScopedSiteSettingKey(tenantType: TenantType, key: SiteSettingKey) {
  return `${tenantType}::${key}`;
}

export function isAllowedSiteSettingKey(key: string): key is SiteSettingKey {
  return isSiteSettingKey(key);
}

function parseBooleanValue(raw: string): boolean {
  return raw.trim().toLowerCase() === "true";
}

function parseStoredSiteSettingValue(key: SiteSettingKey, raw: string): string | boolean | number | null {
  const type = SITE_SETTING_TYPES[key];

  if (type === "boolean") {
    return parseBooleanValue(raw);
  }

  if (type === "number") {
    const num = Number(raw);
    return Number.isNaN(num) ? null : num;
  }

  if (type === "nullable-string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return raw;
}

function serializeSiteSettingValue(
  key: SiteSettingKey,
  value: string | boolean | number | null
): { value?: string; error?: string } {
  const type = SITE_SETTING_TYPES[key];

  if (type === "boolean") {
    if (typeof value !== "boolean") {
      return { error: `${key} 값은 true/false 형식이어야 합니다.` };
    }

    return { value: value ? "true" : "false" };
  }

  if (type === "number") {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return { error: `${key} 값은 숫자여야 합니다.` };
    }
    return { value: String(value) };
  }

  if (type === "nullable-string") {
    if (value !== null && typeof value !== "string") {
      return { error: `${key} 값은 문자열 또는 null 이어야 합니다.` };
    }

    const normalized = typeof value === "string" ? value.trim() : "";

    if ((key === "site.bannerImageUrl" || key === "site.bannerLink") && normalized) {
      const isRelativePath = normalized.startsWith("/");
      let isAbsoluteUrl = false;

      try {
        const parsed = new URL(normalized);
        isAbsoluteUrl = parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        isAbsoluteUrl = false;
      }

      if (!isRelativePath && !isAbsoluteUrl) {
        return { error: `${key} 값은 유효한 URL이어야 합니다.` };
      }
    }

    return { value: normalized };
  }

  if (typeof value !== "string") {
    return { error: `${key} 값은 문자열이어야 합니다.` };
  }

  const normalized = value.trim();
  if (!normalized) {
    return { error: `${key} 값은 비워둘 수 없습니다.` };
  }

  return { value: normalized };
}

async function readSiteSettingsFromDb(tenantType: TenantType): Promise<SiteSettingsMap> {
  const merged: SiteSettingsMap = getTenantSiteSettingDefaults(tenantType);
  const baseKeys = Object.keys(SITE_SETTING_TYPES) as SiteSettingKey[];
  const scopedKeys = baseKeys.map((key) => toScopedSiteSettingKey(tenantType, key));
  const tenantPrisma = getPrismaClientForTenant(tenantType);

  try {
    const rows = await withPrismaConnectionRetry(
      () =>
        tenantPrisma.siteSetting.findMany({
          where: {
            key: {
              in: [...baseKeys, ...scopedKeys],
            },
          },
          select: {
            key: true,
            value: true,
          },
        }),
      "site settings read"
    );

    if (tenantType === "fire") {
      for (const row of rows) {
        if (!isSiteSettingKey(row.key)) {
          continue;
        }

        merged[row.key] = parseStoredSiteSettingValue(row.key, row.value);
      }
    }

    for (const row of rows) {
      if (!row.key.startsWith(`${tenantType}::`)) {
        continue;
      }

      const baseKey = row.key.slice(`${tenantType}::`.length);
      if (!isSiteSettingKey(baseKey)) {
        continue;
      }

      merged[baseKey] = parseStoredSiteSettingValue(baseKey, row.value);
    }
  } catch (error) {
    console.error("사이트 설정 캐시 조회 중 오류가 발생했습니다.", error);
  }

  return merged;
}

function getCachedSiteSettingsByTenant(tenantType: TenantType) {
  return unstable_cache(
    async (): Promise<SiteSettingsMap> => readSiteSettingsFromDb(tenantType),
    [`site-settings:all:${tenantType}`],
    {
      revalidate: 60,
      tags: [SITE_SETTINGS_TAG, `${SITE_SETTINGS_TAG}:${tenantType}`],
    }
  )();
}

async function readActiveNoticesFromDb(tenantType: TenantType): Promise<PublicNoticeItem[]> {
  const now = new Date();
  const prisma = getPrismaClientForTenant(tenantType);

  const notices = await prisma.notice.findMany({
    where: {
      tenantType,
      isActive: true,
      AND: [
        {
          OR: [{ startAt: null }, { startAt: { lte: now } }],
        },
        {
          OR: [{ endAt: null }, { endAt: { gte: now } }],
        },
      ],
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      title: true,
      content: true,
      priority: true,
      startAt: true,
      endAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return notices.map((notice) => ({
    id: notice.id,
    title: notice.title,
    content: notice.content,
    priority: notice.priority,
    startAt: notice.startAt ? notice.startAt.toISOString() : null,
    endAt: notice.endAt ? notice.endAt.toISOString() : null,
    createdAt: notice.createdAt.toISOString(),
    updatedAt: notice.updatedAt.toISOString(),
  }));
}

function getCachedActiveNoticesByTenant(tenantType: TenantType) {
  return unstable_cache(
    async (): Promise<PublicNoticeItem[]> => {
      try {
        return await readActiveNoticesFromDb(tenantType);
      } catch (error) {
        console.error("공지 캐시 조회 중 오류가 발생했습니다.", error);
        return [];
      }
    },
    [`notices:active:${tenantType}`],
    {
      revalidate: 60,
      tags: [ACTIVE_NOTICES_TAG, `${ACTIVE_NOTICES_TAG}:${tenantType}`],
    }
  )();
}

export async function getSiteSettings(): Promise<SiteSettingsMap> {
  const tenantType = await getServerTenantType();
  return getCachedSiteSettingsByTenant(tenantType);
}

export async function getSiteSettingsUncached(): Promise<SiteSettingsMap> {
  const tenantType = await getServerTenantType();
  return readSiteSettingsFromDb(tenantType);
}

export async function getActiveNotices(): Promise<PublicNoticeItem[]> {
  const tenantType = await getServerTenantType();
  return getCachedActiveNoticesByTenant(tenantType);
}

export function normalizeSiteSettingUpdateEntries(input: Record<string, unknown>): {
  data?: Array<{ key: SiteSettingKey; value: string }>;
  error?: string;
} {
  const entries = Object.entries(input);
  if (entries.length === 0) {
    return { error: "변경할 설정 값이 없습니다." };
  }

  const normalized: Array<{ key: SiteSettingKey; value: string }> = [];

  for (const [rawKey, rawValue] of entries) {
    if (!isSiteSettingKey(rawKey)) {
      return { error: `지원하지 않는 설정 항목입니다: ${rawKey}` };
    }

    const serialized = serializeSiteSettingValue(rawKey, rawValue as string | boolean | number | null);
    if (serialized.error || serialized.value === undefined) {
      return { error: serialized.error ?? `${rawKey} 값이 올바르지 않습니다.` };
    }

    normalized.push({ key: rawKey, value: serialized.value });
  }

  return { data: normalized };
}

export async function upsertSiteSettings(entries: Array<{ key: SiteSettingKey; value: string }>) {
  const tenantType = await getServerTenantType();

  await prisma.$transaction(async (tx) => {
    return Promise.all(
      entries.map((entry) =>
        tx.siteSetting.upsert({
        where: { key: toScopedSiteSettingKey(tenantType, entry.key) },
        update: { value: entry.value },
        create: { key: toScopedSiteSettingKey(tenantType, entry.key), value: entry.value },
      })
      )
    );
  });

  revalidateTag(SITE_SETTINGS_TAG, "max");
  revalidateTag(`${SITE_SETTINGS_TAG}:${tenantType}`, "max");
}

export function revalidateSiteSettingsCache() {
  revalidateTag(SITE_SETTINGS_TAG, "max");
}

export function revalidateNoticeCache(tenantType?: TenantType) {
  revalidateTag(ACTIVE_NOTICES_TAG, "max");
  if (tenantType) {
    revalidateTag(`${ACTIVE_NOTICES_TAG}:${tenantType}`, "max");
  }
}
