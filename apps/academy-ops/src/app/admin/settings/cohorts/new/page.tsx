import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { CohortCreateForm } from "./cohort-create-form";

export const dynamic = "force-dynamic";

export default async function CohortNewPage() {
  await requireAdminContext(AdminRole.MANAGER);

  return (
    <div className="p-8 sm:p-10">
      {/* Back link */}
      <div>
        <Link
          href="/admin/settings/cohorts"
          className="inline-flex items-center gap-1.5 text-sm text-slate transition hover:text-ink"
        >
          <span>&larr;</span>
          <span>기수 목록으로</span>
        </Link>
      </div>

      {/* Page header */}
      <div className="mt-4">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          설정 · 기수 등록
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-ink">새 기수 등록</h1>
        <p className="mt-4 max-w-2xl text-sm leading-8 text-slate sm:text-base">
          새 기수를 등록합니다. 수험유형, 시작일·종료일, 정원을 입력하세요.
        </p>
      </div>

      {/* Form */}
      <div className="mt-8 max-w-2xl">
        <CohortCreateForm />
      </div>
    </div>
  );
}
