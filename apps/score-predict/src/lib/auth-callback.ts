import { parseTenantTypeFromPathname, type TenantType } from "@/lib/tenant";

const CALLBACK_ORIGIN = "https://callback.local";

/**
 * 로그인 뒤 이동할 주소는 현재 서비스 안의 상대 경로만 허용한다.
 * 외부 URL, 프로토콜 상대 URL, 반대 테넌트 경로는 안전한 기본 주소로 되돌린다.
 */
export function resolveSafeAuthCallback(
  requestedCallback: string | null | undefined,
  fallback: string,
  tenantType: TenantType
): string {
  if (!requestedCallback || !requestedCallback.startsWith("/") || requestedCallback.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(requestedCallback, CALLBACK_ORIGIN);
    if (parsed.origin !== CALLBACK_ORIGIN) return fallback;

    const callbackTenant = parseTenantTypeFromPathname(parsed.pathname);
    if (callbackTenant && callbackTenant !== tenantType) return fallback;

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
