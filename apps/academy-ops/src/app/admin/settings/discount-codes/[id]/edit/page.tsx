import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DiscountCodeEditForm } from "./discount-code-edit-form";
import { getAcademyById, getAcademyLabel } from "@/lib/academy";
import { getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { applyDiscountCodeAcademyScope } from "@/lib/discount-codes/service";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DiscountCodeEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminContext(AdminRole.MANAGER);

  const scope = await getAdminAcademyScope();
  const visibleAcademyId = resolveVisibleAcademyId(scope);

  if (visibleAcademyId === null) {
    return (
      <div className="p-8 sm:p-10">
        <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
          설정 · 할인 코드 수정
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-ink">할인 코드 수정</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
          할인 코드 수정은 특정 지점을 선택한 상태에서만 가능합니다. 상단 지점 전환기에서 먼저 지점을 선택해 주세요.
        </p>
        <div className="mt-6 flex gap-2">
          <Link href="/admin/settings/discount-codes" className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30">
            할인 코드 관리로 이동
          </Link>
        </div>
      </div>
    );
  }

  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }

  const [academy, code] = await Promise.all([
    getAcademyById(visibleAcademyId),
    getPrisma().discountCode.findFirst({
      where: applyDiscountCodeAcademyScope({ id }, visibleAcademyId),
      select: {
        id: true,
        code: true,
        type: true,
        discountType: true,
        discountValue: true,
        maxUsage: true,
        validFrom: true,
        validUntil: true,
        isActive: true,
        usageCount: true,
      },
    }),
  ]);

  if (!code) {
    notFound();
  }

  return (
    <div className="p-8 sm:p-10">
      <div className="flex items-center gap-2 text-sm text-slate">
        <Link href="/admin/settings/discount-codes" className="transition hover:text-ember">
          할인 코드 관리
        </Link>
        <span>/</span>
        <Link href={`/admin/settings/discount-codes/${code.id}`} className="font-mono transition hover:text-ember">
          {code.code}
        </Link>
        <span>/</span>
        <span className="font-semibold text-ink">수정</span>
      </div>

      <div className="mt-6">
        <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
          설정 · 할인 코드 수정
        </div>
        <h1 className="mt-3 font-mono text-3xl font-semibold text-ink">{code.code} 수정</h1>
        <p className="mt-2 text-sm text-slate">
          현재 지점: <span className="font-semibold text-ink">{getAcademyLabel(academy)}</span>
        </p>
        <p className="mt-2 text-sm text-slate">할인 코드의 기본 정보와 유효 기간, 활성 상태를 수정합니다.</p>
      </div>

      <DiscountCodeEditForm
        discountCode={{
          id: code.id,
          code: code.code,
          type: code.type,
          discountType: code.discountType,
          discountValue: code.discountValue,
          maxUsage: code.maxUsage,
          validFrom: code.validFrom.toISOString(),
          validUntil: code.validUntil?.toISOString() ?? null,
          isActive: code.isActive,
          usageCount: code.usageCount,
        }}
      />
    </div>
  );
}