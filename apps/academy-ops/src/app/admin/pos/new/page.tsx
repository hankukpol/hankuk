import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { PosCheckoutForm } from "./pos-checkout-form";

export const dynamic = "force-dynamic";

export default async function PosNewPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  // Fetch active special lectures for quick product selection
  const specialLectures = await getPrisma().specialLecture.findMany({
    where: { isActive: true },
    select: { id: true, name: true, fullPackagePrice: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-8 sm:p-10">
      {/* Badge */}
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        결제
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">단과 빠른 결제</h1>
          <p className="mt-2 text-sm leading-7 text-slate">
            단과·특강 즉석 결제를 신속하게 처리합니다.
          </p>
        </div>
        <a
          href="/admin/pos"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          ← 오늘 결제 목록
        </a>
      </div>

      <div className="mt-8 max-w-2xl">
        <PosCheckoutForm
          specialLectures={specialLectures.map((s) => ({
            id: s.id,
            name: s.name,
            price: s.fullPackagePrice ?? 0,
          }))}
        />
      </div>
    </div>
  );
}
