"use client";

import { useTenantConfig } from "@/components/providers/TenantProvider";
import dynamic from "next/dynamic";

const FirePage = dynamic(() => import("./_FirePage"));
const PolicePage = dynamic(() => import("./_PolicePage"));

export default function Page() {
  const tenant = useTenantConfig();
  return tenant.type === "police" ? <PolicePage /> : <FirePage />;
}
