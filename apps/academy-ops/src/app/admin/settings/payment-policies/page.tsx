import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { DiscountCodeManager } from "./discount-code-manager";
import { getAcademyById, getAcademyLabel } from "@/lib/academy";
import { getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { applyDiscountCodeAcademyScope } from "@/lib/discount-codes/service";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export type DiscountCodeRow = {
  id: number;
  code: string;
  type: "REFERRAL" | "ENROLLMENT" | "CAMPAIGN";
  discountType: "RATE" | "FIXED";
  discountValue: number;
  maxUsage: number | null;
  usageCount: number;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  staffName: string;
  createdAt: string;
};

const DISCOUNT_TYPES = [
  { id: 1, name: "동시수강 할인", description: "같은 기수에서 두 과정을 함께 등록할 때 적용합니다.", value: "정액 할인", category: "정규 수강" },
  { id: 2, name: "가족 할인", description: "직계 가족이 현재 수강 중일 때 적용합니다.", value: "정액 할인", category: "가족" },
  { id: 3, name: "자격 할인", description: "경찰·군 관련 자격 및 경력 기준을 충족할 때 적용합니다.", value: "정액 할인", category: "자격" },
  { id: 4, name: "재수강 할인", description: "기존 수강생의 재등록이나 연장 등록에 적용합니다.", value: "비율 할인", category: "재등록" },
  { id: 5, name: "추천인 할인", description: "추천인 코드나 입소 코드 등록 시 적용합니다.", value: "코드 기반", category: "코드" },
  { id: 6, name: "캠페인 할인", description: "지점별 프로모션, 이벤트, 마감 특가에 사용합니다.", value: "코드 기반", category: "코드" },
  { id: 7, name: "관리자 수기 할인", description: "원장 또는 부원장 승인 후 예외 할인으로 적용합니다.", value: "직접 입력", category: "승인" },
] as const;

const CATEGORY_COLORS: Record<(typeof DISCOUNT_TYPES)[number]["category"], string> = {
  "정규 수강": "border-ember/20 bg-ember/10 text-ember",
  가족: "border-forest/20 bg-forest/10 text-forest",
  자격: "border-blue-200 bg-blue-50 text-blue-700",
  재등록: "border-purple-200 bg-purple-50 text-purple-700",
  코드: "border-sky-200 bg-sky-50 text-sky-700",
  승인: "border-ink/10 bg-mist text-slate",
};

export default async function PaymentPoliciesPage() {
  await requireAdminContext(AdminRole.DIRECTOR);

  const scope = await getAdminAcademyScope();
  const visibleAcademyId = resolveVisibleAcademyId(scope);

  if (visibleAcademyId === null) {
    return (
      <div className="p-8 sm:p-10">
        <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
          설정 · 수납 정책
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-ink">수납 정책 관리</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
          할인 정책과 할인 코드 관리는 지점별 운영 기준을 따릅니다. 전체 보기 상태에서는 저장 대상을 확정할 수 없으므로,
          상단 지점 전환기에서 먼저 지점을 선택해 주세요.
        </p>
        <div className="mt-8 rounded-[28px] border border-dashed border-amber-300 bg-amber-50/70 p-8 text-sm leading-7 text-amber-900">
          <p className="font-semibold">지점 선택이 필요합니다.</p>
          <p className="mt-2">지점을 선택하면 해당 지점의 할인 기준표와 할인 코드를 함께 관리할 수 있습니다.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/admin/settings" className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30">
              설정 허브로 이동
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const [academy, codes] = await Promise.all([
    getAcademyById(visibleAcademyId),
    getPrisma().discountCode.findMany({
      where: applyDiscountCodeAcademyScope({}, visibleAcademyId),
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: { staff: { select: { name: true } } },
    }),
  ]);

  const rows: DiscountCodeRow[] = codes.map((code) => ({
    id: code.id,
    code: code.code,
    type: code.type as DiscountCodeRow["type"],
    discountType: code.discountType as DiscountCodeRow["discountType"],
    discountValue: code.discountValue,
    maxUsage: code.maxUsage,
    usageCount: code.usageCount,
    validFrom: code.validFrom.toISOString().slice(0, 10),
    validUntil: code.validUntil ? code.validUntil.toISOString().slice(0, 10) : null,
    isActive: code.isActive,
    staffName: code.staff?.name ?? "-",
    createdAt: code.createdAt.toISOString(),
  }));

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        설정 · 수납 정책
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">수납 정책 관리</h1>
      <p className="mt-2 text-sm text-slate">
        현재 지점: <span className="font-semibold text-ink">{getAcademyLabel(academy)}</span>
      </p>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        지점별 할인 기준과 코드 발급 정책을 함께 관리합니다. 실제 수납 등록 시 적용되는 할인 기준을 먼저 확인하고,
        코드 기반 할인은 아래 목록에서 발급 및 수정할 수 있습니다.
      </p>

      <div className="mt-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">할인 유형 기준표</h2>
            <p className="mt-1 text-sm text-slate">현재 운영 중인 할인 분류와 적용 목적을 정리한 기준표입니다.</p>
          </div>
          <div className="shrink-0 rounded-[20px] border border-amber-200 bg-amber-50 px-5 py-3.5 text-right">
            <p className="text-xs font-semibold text-amber-800">운영 메모</p>
            <p className="mt-0.5 text-sm font-bold text-amber-900">중복 할인은 승인 기준을 확인하세요.</p>
            <p className="mt-0.5 text-xs text-amber-700">예외 할인은 관리자 승인 흐름을 따릅니다.</p>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[28px] border border-ink/10 shadow-panel">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="w-8 px-5 py-3.5 text-xs font-semibold text-slate">#</th>
                <th className="px-5 py-3.5 font-semibold">할인 유형</th>
                <th className="px-5 py-3.5 font-semibold">적용 기준</th>
                <th className="px-5 py-3.5 font-semibold">분류</th>
                <th className="px-5 py-3.5 text-right font-semibold">적용 방식</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10 bg-white">
              {DISCOUNT_TYPES.map((discountType) => (
                <tr key={discountType.id} className="transition hover:bg-mist/40">
                  <td className="px-5 py-3.5 text-xs text-slate/60">{discountType.id}</td>
                  <td className="px-5 py-3.5 font-semibold text-ink">{discountType.name}</td>
                  <td className="px-5 py-3.5 text-slate">{discountType.description}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_COLORS[discountType.category]}`}>
                      {discountType.category}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold text-ink">{discountType.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-12">
        <h2 className="text-xl font-semibold text-ink">할인 코드 관리</h2>
        <p className="mt-1 text-sm text-slate">추천인 코드, 등록 코드, 캠페인 코드를 지점별로 발급하고 관리합니다.</p>
        <div className="mt-5">
          <DiscountCodeManager initialCodes={rows} />
        </div>
      </div>
    </div>
  );
}