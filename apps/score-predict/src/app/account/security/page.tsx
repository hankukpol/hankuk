import AccountSecurityForm from "@/components/account/AccountSecurityForm";
import { getCurrentTenantSessionContext } from "@/lib/tenant-session.server";
import { redirect } from "next/navigation";

export default async function AccountSecurityPage() {
  const current = await getCurrentTenantSessionContext();
  if (!current) redirect("/login");

  return (
    <main className="pb-16">
      {/* 시험 화면과 같은 `user-content-frame` 기준선 위에서 설정 화면 폭만 좁게 잡는다. */}
      <div className="user-content-frame pt-[100px]">
        <div className="mx-auto w-full max-w-[640px]">
          <AccountSecurityForm />
        </div>
      </div>
    </main>
  );
}
