import { notFound } from "next/navigation";
import SmsMarketingConsentForm from "@/components/account/SmsMarketingConsentForm";
import { getServerTenantType } from "@/lib/tenant.server";

export default async function NotificationSettingsPage() {
  const tenantType = await getServerTenantType();
  if (tenantType !== "police") notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <SmsMarketingConsentForm />
    </main>
  );
}
