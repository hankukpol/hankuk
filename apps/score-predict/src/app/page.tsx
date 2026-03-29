import { getServerTenantType } from "@/lib/tenant.server";

export const dynamic = "force-dynamic";

export default async function Page() {
  const tenantType = await getServerTenantType();
  const { default: PageComponent } =
    tenantType === "police"
      ? await import("./_PolicePage")
      : await import("./_FirePage");
  return <PageComponent />;
}
