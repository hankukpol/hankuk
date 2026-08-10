import { redirect } from "next/navigation";
import { withTenantPrefix } from "@/lib/tenant";
import { getServerTenantType } from "@/lib/tenant.server";

export default async function ResetPasswordPage() {
  const tenantType = await getServerTenantType();
  redirect(withTenantPrefix("/forgot-password", tenantType));
}
