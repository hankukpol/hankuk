import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AppSwitchMenu from "@/components/admin/AppSwitchMenu";
import { getCurrentTenantSessionContext } from "@/lib/tenant-session.server";
import { withTenantPrefix } from "@/lib/tenant";
import { getServerTenantType } from "@/lib/tenant.server";
import ActiveExamHealthBanner from "@/components/admin/ActiveExamHealthBanner";
import AdminSectionTabs from "@/components/admin/AdminSectionTabs";

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
    <div className="admin-shell relative flex h-screen w-full overflow-hidden">
      <AdminSidebar />
      <main className="admin-main flex-1 overflow-y-auto">
        <div className="admin-content-frame">
          <div className="admin-utility-row">
            <AppSwitchMenu role="admin" divisionSlug={tenantType} />
          </div>
          <ActiveExamHealthBanner />
          <AdminSectionTabs />
          {children}
        </div>
      </main>
    </div>
  );
}
