"use client";

import UnifiedAccountLookupForm from "@/components/account/UnifiedAccountLookupForm";
import { useTenantConfig } from "@/components/providers/TenantProvider";

export default function FindAccountPage() {
  const tenant = useTenantConfig();
  return <UnifiedAccountLookupForm tenantType={tenant.type} />;
}
