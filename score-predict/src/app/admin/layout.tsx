import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { authOptions } from "@/lib/auth";
import { withTenantPrefix } from "@/lib/tenant";
import { getServerTenantType } from "@/lib/tenant.server";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);
  const tenantType = await getServerTenantType();

  if (!session?.user) {
    redirect(
      `${withTenantPrefix("/login", tenantType)}?callbackUrl=${encodeURIComponent(
        withTenantPrefix("/admin", tenantType)
      )}`
    );
  }

  if (session.user.role !== "ADMIN") {
    redirect(withTenantPrefix("/", tenantType));
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-fire-950">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
