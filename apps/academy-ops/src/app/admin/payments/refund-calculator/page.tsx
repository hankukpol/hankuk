import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { RefundCalculatorClient } from "./refund-calculator-client";

export const dynamic = "force-dynamic";

export default async function RefundCalculatorPage() {
  await requireAdminContext(AdminRole.COUNSELOR);

  return (
    <div className="p-8 sm:p-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/admin/payments"
          className="text-slate transition hover:text-ink"
        >
          수납 관리
        </Link>
        <span className="text-slate/40">/</span>
        <Link
          href="/admin/payments/refunds"
          className="text-slate transition hover:text-ink"
        >
          환불 대기
        </Link>
        <span className="text-slate/40">/</span>
        <span className="text-ink">환불 계산기</span>
      </div>

      {/* Header */}
      <div className="mt-4 inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-ember">
        수납 관리
      </div>
      <div className="mt-3">
        <h1 className="text-3xl font-semibold text-ink">환불 계산기</h1>
        <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate">
          학원법 제18조(수강료 반환 기준)에 따른 환불 예상액을 계산합니다.
          수강 시작일·기간·수강료를 입력하면 환불 신청일 기준으로 자동
          계산됩니다.
        </p>
      </div>

      {/* Info box */}
      <div className="mt-5 rounded-[16px] border border-forest/20 bg-forest/5 px-5 py-4 text-sm text-forest">
        <p className="font-semibold">학원법 환불 기준 요약</p>
        <ul className="mt-2 space-y-1 text-xs text-forest/80">
          <li>· 수업 1/3 미경과 → 수강료 전액 환불</li>
          <li>· 수업 1/3 이상 ~ 1/2 미만 경과 → 수강료의 2/3 환불</li>
          <li>· 수업 1/2 이상 경과 → 환불 불가</li>
          <li className="mt-1 text-slate/70">
            * 교재비는 수업 진행 여부와 관계없이 환불되지 않습니다.
          </li>
        </ul>
      </div>

      {/* Calculator */}
      <div className="mt-8">
        <RefundCalculatorClient />
      </div>
    </div>
  );
}
