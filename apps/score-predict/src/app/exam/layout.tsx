import { redirect } from "next/navigation";
import { headers } from "next/headers";
import PublicExamNavigation, {
  type PublicExamNavigationKey,
} from "@/components/layout/PublicExamNavigation";
import {
  getExamSurfaceState,
  getPreferredExamRoute,
  isPublicExamPagePath,
} from "@/lib/exam-surface";
import { getEffectiveSiteSettings } from "@/lib/exam-operation";
import { getServerTenantType } from "@/lib/tenant.server";
import { stripTenantPrefix, withTenantPrefix } from "@/lib/tenant";
import { getCurrentTenantSessionContext } from "@/lib/tenant-session.server";

export default async function ExamLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tenantType = await getServerTenantType();
  const current = await getCurrentTenantSessionContext();
  const settings = await getEffectiveSiteSettings();
  const requestHeaders = await headers();
  const originalPathname = requestHeaders.get("x-hankuk-original-pathname");
  const isPublicExamPage = isPublicExamPagePath(originalPathname);
  const normalizedPathname = originalPathname
    ? stripTenantPrefix(originalPathname).replace(/\/+$/, "")
    : "";
  const activePublicNavigationKey: PublicExamNavigationKey =
    normalizedPathname === "/exam/faq" ? "faq" : "notices";
  const examSurfaceState = getExamSurfaceState(settings);
  const preferredExamRoute = getPreferredExamRoute(settings, {
    isAuthenticated: false,
    hasSubmission: false,
  });

  if (!isPublicExamPage && !current?.session.user?.id) {
    redirect(
      `${withTenantPrefix("/login", tenantType)}?callbackUrl=${encodeURIComponent(
        withTenantPrefix(preferredExamRoute.href, tenantType)
      )}`
    );
  }

  const userId = Number(current?.session.user?.id ?? 0);
  if (!isPublicExamPage && (!Number.isInteger(userId) || userId <= 0)) {
    redirect(
      `${withTenantPrefix("/login", tenantType)}?callbackUrl=${encodeURIComponent(
        withTenantPrefix(preferredExamRoute.href, tenantType)
      )}`
    );
  }

  return (
    <>
      {isPublicExamPage ? (
        <PublicExamNavigation
          activeKey={activePublicNavigationKey}
          tenantType={tenantType}
          preRegistrationEnabled={Boolean(settings["site.preRegistrationEnabled"] ?? false)}
          noticesEnabled={examSurfaceState.noticesEnabled}
          faqEnabled={examSurfaceState.tabEnabled.faq}
        />
      ) : null}
      <main className="pb-10">
        <div className="mx-auto w-full max-w-7xl px-4 py-6">{children}</div>
      </main>
    </>
  );
}
