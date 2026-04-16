import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AppSwitchMenu from "@/components/admin/AppSwitchMenu";
import { authOptions } from "@/lib/auth";
import { getPortalLoginUrl } from "@/lib/portal";
import { getServerTenantType } from "@/lib/tenant.server";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [session, tenantType] = await Promise.all([
    getServerSession(authOptions),
    getServerTenantType(),
  ]);

  if (!session?.user) {
    redirect(getPortalLoginUrl());
  }

  if (session.user.role !== "ADMIN") {
    redirect(getPortalLoginUrl());
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-fire-950">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-4 flex justify-end">
            <AppSwitchMenu role="admin" divisionSlug={tenantType} />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
