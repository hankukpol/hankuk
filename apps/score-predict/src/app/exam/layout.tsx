import { redirect } from "next/navigation";
import { getPreferredExamRoute } from "@/lib/exam-surface";
import { getSiteSettingsUncached } from "@/lib/site-settings";
import { getServerTenantType } from "@/lib/tenant.server";
import { withTenantPrefix } from "@/lib/tenant";
import { getCurrentTenantSessionContext } from "@/lib/tenant-session.server";

export default async function ExamLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tenantType = await getServerTenantType();
  const current = await getCurrentTenantSessionContext();
  const settings = await getSiteSettingsUncached();
  const preferredExamRoute = getPreferredExamRoute(settings, {
    isAuthenticated: false,
    hasSubmission: false,
  });

  if (!current?.session.user?.id) {
    redirect(
      `${withTenantPrefix("/login", tenantType)}?callbackUrl=${encodeURIComponent(
        withTenantPrefix(preferredExamRoute.href, tenantType)
      )}`
    );
  }

  const userId = Number(current.session.user.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    redirect(
      `${withTenantPrefix("/login", tenantType)}?callbackUrl=${encodeURIComponent(
        withTenantPrefix(preferredExamRoute.href, tenantType)
      )}`
    );
  }

  return (
    <main className="pb-10">
      <div className="mx-auto w-full max-w-7xl px-4 py-6">{children}</div>
    </main>
  );
}
