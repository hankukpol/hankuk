import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getPreferredExamRoute } from "@/lib/exam-surface";
import { getSiteSettingsUncached } from "@/lib/site-settings";
import { getServerTenantType } from "@/lib/tenant.server";
import { withTenantPrefix } from "@/lib/tenant";

export default async function ExamLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);
  const tenantType = await getServerTenantType();
  const settings = await getSiteSettingsUncached();
  const preferredExamRoute = getPreferredExamRoute(settings, {
    isAuthenticated: false,
    hasSubmission: false,
  });

  if (!session?.user?.id) {
    redirect(
      `${withTenantPrefix("/login", tenantType)}?callbackUrl=${encodeURIComponent(
        withTenantPrefix(preferredExamRoute.href, tenantType)
      )}`
    );
  }

  const userId = Number(session.user.id);
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
