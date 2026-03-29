import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { ProductManager } from "@/components/comprehensive-products/product-manager";

export const dynamic = "force-dynamic";

export default async function ComprehensiveProductsSettingsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const products = await getPrisma().comprehensiveCourseProduct.findMany({
    orderBy: [{ examCategory: "asc" }, { durationMonths: "asc" }],
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정 · 종합반 상품
      </div>
      <h1 className="mt-5 text-3xl font-semibold">종합반 상품 관리</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        수험유형별 종합반 수강기간·수강료 상품을 등록하고 관리합니다. 수강 등록 시 이 상품
        목록에서 선택합니다.
      </p>
      <div className="mt-8">
        <ProductManager initialProducts={products as any} />
      </div>
    </div>
  );
}
