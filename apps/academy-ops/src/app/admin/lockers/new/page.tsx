import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { NewLockerForm } from "./new-locker-form";

export const dynamic = "force-dynamic";

export default async function NewLockerPage() {
  await requireAdminContext(AdminRole.MANAGER);

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/lockers" className="hover:text-ink">
          사물함 현황
        </Link>
        <span>/</span>
        <span className="text-ink">새 사물함 등록</span>
      </nav>

      <div className="mt-4 inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-800">
        시설 관리
      </div>

      <div className="mt-5">
        <h1 className="text-3xl font-semibold">새 사물함 등록</h1>
        <p className="mt-1 text-sm text-slate">
          구역과 번호를 지정하여 새 사물함을 추가합니다.
        </p>
      </div>

      <NewLockerForm />
    </div>
  );
}
