import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { InstructorCreateForm } from "./instructor-create-form";

export const dynamic = "force-dynamic";

export default async function InstructorNewPage() {
  await requireAdminContext(AdminRole.MANAGER);

  return (
    <div className="p-8 sm:p-10">
      {/* Back link */}
      <div>
        <Link
          href="/admin/settings/instructors"
          className="inline-flex items-center gap-1.5 text-sm text-slate transition hover:text-ink"
        >
          <span>&larr;</span>
          <span>강사 목록으로</span>
        </Link>
      </div>

      {/* Page header */}
      <div className="mt-4">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          설정 · 강사 등록
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-ink">새 강사 등록</h1>
        <p className="mt-4 max-w-2xl text-sm leading-8 text-slate sm:text-base">
          새 강사 정보를 등록합니다. 정산 계좌 정보는 나중에 수정할 수 있습니다.
        </p>
      </div>

      {/* Form */}
      <div className="mt-8 max-w-2xl">
        <InstructorCreateForm />
      </div>
    </div>
  );
}
