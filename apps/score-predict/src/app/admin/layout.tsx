import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AppSwitchMenu from "@/components/admin/AppSwitchMenu";
import { getCurrentTenantSessionContext } from "@/lib/tenant-session.server";
import { withTenantPrefix } from "@/lib/tenant";
import { getServerTenantType } from "@/lib/tenant.server";
import ActiveExamHealthBanner from "@/components/admin/ActiveExamHealthBanner";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tenantType = await getServerTenantType();
  const current = await getCurrentTenantSessionContext();
  if (!current || current.session.user.role !== "ADMIN") {
    redirect(withTenantPrefix("/admin-login", tenantType));
  }

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-service-950">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-4 flex justify-end">
            <AppSwitchMenu role="admin" divisionSlug={tenantType} />
          </div>
          <ActiveExamHealthBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
