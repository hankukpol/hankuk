import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { DiscountCodeCreateForm } from "./discount-code-create-form";

export const dynamic = "force-dynamic";

export default async function DiscountCodeNewPage() {
  await requireAdminContext(AdminRole.MANAGER);

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/settings/discount-codes" className="transition hover:text-ember">
          할인 코드 관리
        </Link>
        <span>/</span>
        <span className="font-semibold text-ink">새 할인 코드 등록</span>
      </div>

      <div className="mt-6">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          할인코드 신규 등록
        </div>
        <h1 className="mt-3 text-3xl font-semibold">새 할인 코드 등록</h1>
        <p className="mt-2 text-sm text-slate">
          수강료 할인 코드를 새로 등록합니다. 비율(%) 또는 정액(원) 할인을 설정하고 유효 기간과 사용 횟수를 제한할 수 있습니다.
        </p>
      </div>

      <DiscountCodeCreateForm />
    </div>
  );
}
