import { headers } from "next/headers";
import {
  DEFAULT_TENANT_TYPE,
  getTenantConfigByType,
  parseTenantTypeFromHostname,
  parseTenantTypeFromPathname,
  type TenantConfig,
  type TenantType,
} from "@/lib/tenant";

export async function getServerTenantType(): Promise<TenantType> {
  const headerStore = await headers();

  const resolved =
    parseTenantTypeFromHostname(
      headerStore.get("x-forwarded-host") ?? headerStore.get("host")
    ) ??
    parseTenantTypeFromPathname(headerStore.get("x-hankuk-original-pathname"));

  if (resolved) {
    return resolved;
  }

  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("요청에서 경찰·소방 서비스 구분을 확인할 수 없습니다.");
  }

  return DEFAULT_TENANT_TYPE;
}

export async function getServerTenantConfig(): Promise<TenantConfig> {
  const type = await getServerTenantType();
  return getTenantConfigByType(type);
}
