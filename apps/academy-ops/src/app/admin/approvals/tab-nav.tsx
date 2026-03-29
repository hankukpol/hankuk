"use client";

import { useRouter } from "next/navigation";

export type ApprovalTab = "refund" | "discount" | "cash" | "studyroom";

const TAB_DEFS: { key: ApprovalTab; label: string }[] = [
  { key: "refund", label: "환불 대기" },
  { key: "discount", label: "할인 승인 대기" },
  { key: "cash", label: "고액 현금 수납" },
  { key: "studyroom", label: "스터디룸 신청" },
];

type TabNavProps = {
  activeTab: ApprovalTab;
  refundCount: number;
  discountCount: number;
  cashCount: number;
  studyroomCount: number;
};

export function TabNav({ activeTab, refundCount, discountCount, cashCount, studyroomCount }: TabNavProps) {
  const router = useRouter();

  const counts: Record<ApprovalTab, number> = {
    refund: refundCount,
    discount: discountCount,
    cash: cashCount,
    studyroom: studyroomCount,
  };

  return (
    <div className="mt-8 flex gap-1 rounded-2xl border border-ink/10 bg-mist/60 p-1.5">
      {TAB_DEFS.map((tab) => {
        const active = activeTab === tab.key;
        const count = counts[tab.key];
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => router.push(`/admin/approvals?tab=${tab.key}`)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
              active
                ? "bg-white text-ink shadow-sm"
                : "text-slate hover:text-ink"
            }`}
          >
            {tab.label}
            {count > 0 ? (
              <span
                className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold ${
                  active
                    ? "bg-amber-100 text-amber-700"
                    : "bg-ink/10 text-ink/60"
                }`}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
