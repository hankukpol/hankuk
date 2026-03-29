import { withTenantPrefix } from "@/lib/tenant";
import { getServerTenantType } from "@/lib/tenant.server";
import { redirect } from "next/navigation";

export default async function Page() {
  const tenantType = await getServerTenantType();

  if (tenantType === "police") {
    redirect(withTenantPrefix("/forgot-password", tenantType));
  }

  const { default: FirePage } = await import("./_FirePage");
  return <FirePage />;
}
