import type { JWT } from "next-auth/jwt";
import type { TenantType } from "@/lib/tenant";

export const SCORE_PREDICT_SESSION_VERSION = 2;

export function isCurrentTenantToken(
  token: JWT | null,
  tenantType: TenantType
): token is JWT & { tenantType: TenantType; sessionVersion: number } {
  return (
    token !== null &&
    token.tenantType === tenantType &&
    token.sessionVersion === SCORE_PREDICT_SESSION_VERSION
  );
}
