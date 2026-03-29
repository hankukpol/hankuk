import { AdminRole } from "@prisma/client";
import Link from "next/link";
import { requireAdminContext } from "@/lib/auth";
import { getSystemConfig } from "@/lib/system-config";
import { RefundPolicyEditor } from "./refund-policy-editor";

export const dynamic = "force-dynamic";

// 학원법 제18조 법적 기준 (변경 불가)
const LEGAL_POLICIES = [
  {
    id: 1,
    stage: "수업 시작 전",
    condition: "수업 개시 전",
    legalRefund: 100,
    note: "전액 환불",
    rowColor: "bg-forest/5",
  },
  {
    id: 2,
    stage: "수강 1/3 미경과",
    condition: "총 수강 기간의 1/3 미경과",
    legalRefund: 67,
    note: "납부 금액의 2/3 환불",
    rowColor: "bg-white",
  },
  {
    id: 3,
    stage: "수강 1/3 ~ 1/2",
    condition: "1/3 경과 이후 ~ 1/2 미경과",
    legalRefund: 50,
    note: "납부 금액의 1/2 환불",
    rowColor: "bg-white",
  },
  {
    id: 4,
    stage: "수강 1/2 이후",
    condition: "총 수강 기간의 1/2 경과 이후",
    legalRefund: 0,
    note: "환불 불가",
    rowColor: "bg-red-50/40",
  },
];

export default async function RefundPoliciesPage() {
  await requireAdminContext(AdminRole.MANAGER);
  const config = await getSystemConfig();

  const currentPolicies = [
    { id: 1, refund: config.refundBeforeStart },
    { id: 2, refund: config.refundBefore1Third },
    { id: 3, refund: config.refundBefore1Half },
    { id: 4, refund: config.refundAfter1Half },
  ];

  return (
    <div className="p-8 sm:p-10">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-2">
        <Link href="/admin/settings" className="text-sm text-slate hover:text-ink">
          ← 설정
        </Link>
      </div>
      <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
        결제·할인
      </div>
      <h1 className="mt-5 text-3xl font-semibold">환불 정책 설정</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        학원법 제18조에 따른 법정 환불 기준과 학원 적용 환불 비율을 관리합니다.
        법정 기준보다 불리하게 설정할 수 없습니다.
      </p>

      {/* 법적 기준 섹션 */}
      <div className="mt-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">법적 환불 기준 (학원법 제18조)</h2>
            <p className="mt-1 text-sm text-slate">
              학원의 설립·운영 및 과외교습에 관한 법률 시행령 제18조에 따른 환불 기준입니다.
              학원은 이 기준보다 유리하게 설정할 수 있습니다.
            </p>
          </div>
          <div className="shrink-0 rounded-[20px] border border-amber-200 bg-amber-50 px-5 py-3.5 text-right">
            <p className="text-xs font-semibold text-amber-800">법적 근거</p>
            <p className="mt-0.5 text-sm font-bold text-amber-900">학원법 시행령</p>
            <p className="mt-0.5 text-xs text-amber-700">제18조 (교습비 반환)</p>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[28px] border border-ink/10 shadow-panel">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <thead className="bg-mist/80 text-left">
              <tr>
                <th className="w-8 px-5 py-3.5 text-xs font-semibold text-slate">#</th>
                <th className="px-5 py-3.5 font-semibold">환불 구간</th>
                <th className="px-5 py-3.5 font-semibold">수강 진행 조건</th>
                <th className="px-5 py-3.5 text-center font-semibold">법정 환불 비율</th>
                <th className="px-5 py-3.5 text-right font-semibold">비고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10">
              {LEGAL_POLICIES.map((p) => (
                <tr key={p.id} className={`transition hover:brightness-95 ${p.rowColor}`}>
                  <td className="px-5 py-3.5 text-xs text-slate/60">{p.id}</td>
                  <td className="px-5 py-3.5 font-semibold text-ink">{p.stage}</td>
                  <td className="px-5 py-3.5 text-slate">{p.condition}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span
                      className={`inline-flex rounded-full px-3 py-0.5 text-sm font-bold ${
                        p.legalRefund === 100
                          ? "bg-forest/10 text-forest"
                          : p.legalRefund === 0
                            ? "bg-red-100 text-red-600"
                            : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {p.legalRefund}%
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right text-slate">{p.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 법적 기준 안내 */}
        <div className="mt-4 rounded-[20px] border border-ink/5 bg-mist/60 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">법적 의무 사항</p>
          <ul className="mt-3 space-y-1.5 text-sm text-slate">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-ember">·</span>
              <span>
                환불 요청일로부터 <strong className="text-ink">5영업일 이내</strong>에 환불해야 합니다.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-ember">·</span>
              <span>
                수강 기간은 <strong className="text-ink">등록일(개강일)</strong>부터 계산합니다.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-ember">·</span>
              <span>
                교재비, 재료비 등 별도 항목은 강습료와 별도로 처리합니다.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-ember">·</span>
              <span>
                위반 시 <strong className="text-ink">교육청 행정처분</strong> 및 과태료 부과 대상이 됩니다.
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* 학원 적용 환불 정책 섹션 (편집 가능) */}
      <div className="mt-12">
        <h2 className="text-xl font-semibold text-ink">학원 적용 환불 정책</h2>
        <p className="mt-1 text-sm text-slate">
          실제 환불 처리 시 적용할 비율을 설정합니다. 법정 기준값이 기본이며,
          학원 사정에 따라 더 유리하게 설정할 수 있습니다.
        </p>
        <div className="mt-5">
          <RefundPolicyEditor
            initialValues={{
              refundBeforeStart: config.refundBeforeStart,
              refundBefore1Third: config.refundBefore1Third,
              refundBefore1Half: config.refundBefore1Half,
              refundAfter1Half: config.refundAfter1Half,
            }}
            legalMinimums={{
              refundBeforeStart: 100,
              refundBefore1Third: 67,
              refundBefore1Half: 50,
              refundAfter1Half: 0,
            }}
            currentPolicies={currentPolicies}
            stages={LEGAL_POLICIES.map((p) => ({
              id: p.id,
              stage: p.stage,
              condition: p.condition,
            }))}
            initialUpdatedAt={config.updatedAt}
          />
        </div>
      </div>
    </div>
  );
}
