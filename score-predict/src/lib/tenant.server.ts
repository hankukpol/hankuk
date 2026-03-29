import { cookies, headers } from "next/headers";
import {
  DEFAULT_TENANT_TYPE,
  TENANT_COOKIE,
  TENANT_HEADER,
  getTenantConfigByType,
  normalizeTenantType,
  parseTenantTypeFromPathname,
  type TenantConfig,
  type TenantType,
} from "@/lib/tenant";

export async function getServerTenantType(): Promise<TenantType> {
  const headerStore = await headers();
  const cookieStore = await cookies();

  return (
    parseTenantTypeFromPathname(headerStore.get("x-hankuk-original-pathname")) ??
    normalizeTenantType(headerStore.get(TENANT_HEADER)) ??
    normalizeTenantType(cookieStore.get(TENANT_COOKIE)?.value) ??
    DEFAULT_TENANT_TYPE
  );
}

export async function getServerTenantConfig(): Promise<TenantConfig> {
  const type = await getServerTenantType();
  return getTenantConfigByType(type);
}
