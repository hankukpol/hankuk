import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { PointGrantForm } from "./point-grant-form";

export const dynamic = "force-dynamic";

export default async function PointGrantPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  return (
    <div className="p-8 sm:p-10 max-w-2xl mx-auto">
      {/* 브레드크럼 */}
      <div className="flex items-center gap-2 text-sm text-[#4B5563] mb-6">
        <Link href="/admin/points" className="hover:text-[#C55A11] transition-colors">
          포인트 현황
        </Link>
        <span>/</span>
        <span className="text-[#111827] font-medium">포인트 지급</span>
      </div>

      {/* 헤더 */}
      <div className="mb-8">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          Points
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-[#111827]">포인트 지급</h1>
        <p className="mt-2 text-sm text-[#4B5563]">
          학생을 검색하고 포인트를 즉시 지급하거나 차감합니다.
          지급 이력은 포인트 현황 페이지에서 확인할 수 있습니다.
        </p>
      </div>

      <PointGrantForm />
    </div>
  );
}
