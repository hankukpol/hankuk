import Link from "next/link";
import { AdminRole } from "@prisma/client";
import { DiscountCodeManager } from "./discount-code-manager";
import { getAcademyById, getAcademyLabel } from "@/lib/academy";
import { getAdminAcademyScope, resolveVisibleAcademyId } from "@/lib/academy-scope";
import { applyDiscountCodeAcademyScope, applyDiscountCodeUsageAcademyScope } from "@/lib/discount-codes/service";
import { requireAdminContext } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DiscountCodesSettingsPage() {
  await requireAdminContext(AdminRole.MANAGER);

  const scope = await getAdminAcademyScope();
  const visibleAcademyId = resolveVisibleAcademyId(scope);

  if (visibleAcademyId === null) {
    return (
      <div className="p-8 sm:p-10">
        <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
          설정 · 할인 코드
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-ink">할인 코드 관리</h1>
        <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
          할인 코드 발급과 수정은 지점별 작업입니다. 전체 보기 상태에서는 저장 대상을 확정할 수 없으므로,
          상단 지점 전환기에서 먼저 지점을 선택해 주세요.
        </p>

        <div className="mt-8 rounded-[28px] border border-dashed border-amber-300 bg-amber-50/70 p-8 text-sm leading-7 text-amber-900">
          <p className="font-semibold">지점 선택이 필요합니다.</p>
          <p className="mt-2">
            슈퍼관리자는 전체 보기 대신 특정 지점을 선택한 뒤 할인 코드 발급, 만료 관리, 사용 통계를 확인해야 합니다.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/admin/settings"
              className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30"
            >
              설정 허브로 이동
            </Link>
            <Link
              href="/admin/super/dashboard"
              className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
            >
              슈퍼 대시보드 보기
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const prisma = getPrisma();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  sevenDaysLater.setHours(23, 59, 59, 999);

  const [academy, codes, allUsages, monthlyUsages] = await Promise.all([
    getAcademyById(visibleAcademyId),
    prisma.discountCode.findMany({
      where: applyDiscountCodeAcademyScope({}, visibleAcademyId),
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: { staff: { select: { name: true } } },
    }),
    prisma.discountCodeUsage.findMany({
      where: applyDiscountCodeUsageAcademyScope({}, visibleAcademyId),
      select: {
        codeId: true,
        usedAt: true,
        payment: { select: { discountAmount: true } },
      },
    }),
    prisma.discountCodeUsage.count({
      where: applyDiscountCodeUsageAcademyScope({ usedAt: { gte: startOfMonth } }, visibleAcademyId),
    }),
  ]);

  const codeStats: Record<number, { usageCount: number; totalDiscountAmount: number }> = {};
  for (const usage of allUsages) {
    const current = codeStats[usage.codeId] ?? { usageCount: 0, totalDiscountAmount: 0 };
    codeStats[usage.codeId] = {
      usageCount: current.usageCount + 1,
      totalDiscountAmount: current.totalDiscountAmount + (usage.payment?.discountAmount ?? 0),
    };
  }

  const activeCount = codes.filter((code) => code.isActive).length;
  const totalDiscountAmount = allUsages.reduce(
    (sum, usage) => sum + (usage.payment?.discountAmount ?? 0),
    0,
  );
  const expiringSoonCodes = codes.filter((code) => {
    if (!code.validUntil || !code.isActive) {
      return false;
    }
    const validUntil = new Date(code.validUntil);
    validUntil.setHours(23, 59, 59, 999);
    return validUntil >= now && validUntil <= sevenDaysLater;
  });

  return (
    <div className="p-8 sm:p-10">
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정 · 할인 코드
      </div>
      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">할인 코드 관리</h1>
          <p className="mt-2 text-sm text-slate">
            현재 지점: <span className="font-semibold text-ink">{getAcademyLabel(academy)}</span>
          </p>
        </div>
        <Link
          href="/admin/settings/discount-codes/analytics"
          className="inline-flex items-center gap-1.5 rounded-full border border-forest/20 bg-forest/10 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/20"
        >
          사용 현황 분석
        </Link>
      </div>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        수강 등록과 수납에서 사용하는 할인 코드를 지점별로 발급하고 관리합니다. 추천인, 등록, 캠페인 유형별로
        할인 방식과 사용 한도를 설정할 수 있습니다.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">활성 코드</p>
          <p className="mt-2 text-3xl font-bold text-ink tabular-nums">{activeCount}</p>
          <p className="mt-1 text-xs text-slate">현재 사용 가능한 할인 코드</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">이번 달 사용</p>
          <p className="mt-2 text-3xl font-bold text-ink tabular-nums">{monthlyUsages}건</p>
          <p className="mt-1 text-xs text-slate">이번 달 할인 코드 적용 수</p>
        </div>
        <div className="rounded-[28px] border border-ink/10 bg-white px-6 py-5">
          <p className="text-xs font-medium uppercase tracking-widest text-slate">누적 할인 총액</p>
          <p className="mt-2 text-3xl font-bold text-ember tabular-nums">
            {totalDiscountAmount.toLocaleString("ko-KR")}원
          </p>
          <p className="mt-1 text-xs text-slate">코드 사용으로 발생한 총 할인</p>
        </div>
      </div>

      {expiringSoonCodes.length > 0 ? (
        <div className="mt-4 rounded-[20px] border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-semibold text-amber-800">
            만료 임박 코드 {expiringSoonCodes.length}건
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {expiringSoonCodes.map((code) => (
              <Link
                key={code.id}
                href={`/admin/settings/discount-codes/${code.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-800 transition hover:border-amber-500"
              >
                <span className="font-mono">{code.code}</span>
                <span className="text-amber-600">
                  ~ {code.validUntil ? code.validUntil.toISOString().slice(0, 10) : "미정"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <DiscountCodeManager initialCodes={codes as any} codeStats={codeStats} />
      </div>
    </div>
  );
}