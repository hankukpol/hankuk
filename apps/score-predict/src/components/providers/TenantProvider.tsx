"use client";

import { createContext, useContext } from "react";
import { getTenantConfigByType, type TenantType } from "@/lib/tenant";

const TenantContext = createContext<TenantType | null>(null);

export function TenantProvider({
  tenantType,
  children,
}: {
  tenantType: TenantType;
  children: React.ReactNode;
}) {
  return <TenantContext.Provider value={tenantType}>{children}</TenantContext.Provider>;
}

export function useTenantType() {
  const tenantType = useContext(TenantContext);

  if (!tenantType) {
    throw new Error("TenantProvider is missing in the current tree.");
  }

  return tenantType;
}

export function useTenantConfig() {
  return getTenantConfigByType(useTenantType());
}
