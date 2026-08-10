import AccountSecurityForm from "@/components/account/AccountSecurityForm";
import { getCurrentTenantSessionContext } from "@/lib/tenant-session.server";
import { redirect } from "next/navigation";

export default async function AccountSecurityPage() {
  const current = await getCurrentTenantSessionContext();
  if (!current) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <AccountSecurityForm />
    </main>
  );
}
