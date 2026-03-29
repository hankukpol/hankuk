"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { PaymentCategory } from "@prisma/client";
import { toast } from "sonner";
import { PAYMENT_CATEGORY_LABEL } from "@/lib/constants";

export type InstallmentEnrollmentSummary = {
  id: string;
  label: string;
  status: string;
};

export type InstallmentItem = {
  id: string;
  paymentId: string;
  seq: number;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  paidPaymentId: string | null;
  payment: {
    id: string;
    examNumber: string | null;
    category: PaymentCategory;
    netAmount: number;
    note: string | null;
    student: {
      name: string;
      phone: string | null;
      enrollments: InstallmentEnrollmentSummary[];
    } | null;
    firstItemName: string | null;
  };
};

type StatusFilter = "overdue" | "upcoming" | "paid" | "all";

type Props = {
  initialItems: InstallmentItem[];
  initialStatus: StatusFilter;
  summary: {
    overdueCount: number;
    upcomingCount: number;
    paidCount: number;
  };
};

const TEXT = {
  paid: "\uB0A9\uBD80",
  overdue: "\uC5F0\uCCB4",
  upcoming: "\uC608\uC815",
  all: "\uC804\uCCB4",
  loading: "\uC870\uD68C \uC911...",
  loadFailed: "\uC870\uD68C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.",
  emptyOverdue: "\uC5F0\uCCB4 \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyUpcoming: "\uC608\uC815\uB41C \uBD84\uD560 \uB0A9\uBD80\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyPaid: "\uB0A9\uBD80 \uC644\uB8CC \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  emptyAll: "\uBD84\uD560 \uB0A9\uBD80 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.",
  student: "\uD559\uC0DD",
  payment: "\uC218\uB0A9 \uB0B4\uC5ED",
  round: "\uD68C\uCC28",
  dueDate: "\uB0A9\uBD80 \uC608\uC815\uC77C",
  amount: "\uAE08\uC561",
  status: "\uC0C1\uD0DC",
  detail: "\uC0C1\uC138",
  action: "\uCC98\uB9AC",
  viewDetail: "\uC0C1\uC138\uBCF4\uAE30",
  processPayment: "\uB0A9\uBD80 \uCC98\uB9AC",
  processing: "\uCC98\uB9AC \uC911...",
  paidOn: "\uB0A9\uBD80",
  none: "\uC5C6\uC74C",
  totalSuffix: "\uAC74",
  confirmPayment:
    "\uB2D8\uC758 {round}\uD68C\uCC28 {amount}\uC744 \uC624\uB298 \uB0A9\uBD80 \uCC98\uB9AC\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?",
  paymentDone: "\uBD84\uD560 \uB0A9\uBD80\uB97C \uCC98\uB9AC\uD588\uC2B5\uB2C8\uB2E4.",
  phoneMissing: "\uC5F0\uB77D\uCC98 \uC5C6\uC74C",
  enrollmentsMissing: "\uC218\uAC15 \uB0B4\uC5ED \uC5C6\uC74C",
  paymentFallback: "\uC218\uB0A9",
} as const;

const STATUS_BADGE: Record<"paid" | "overdue" | "upcoming", { label: string; className: string }> = {
  paid: {
    label: TEXT.paid,
    className: "border-forest/30 bg-forest/10 text-forest",
  },
  overdue: {
    label: TEXT.overdue,
    className: "border-red-200 bg-red-50 text-red-700",
  },
  upcoming: {
    label: TEXT.upcoming,
    className: "border-ink/20 bg-ink/5 text-slate",
  },
};

const TABS: { value: StatusFilter; label: string }[] = [
  { value: "overdue", label: TEXT.overdue },
  { value: "upcoming", label: TEXT.upcoming },
  { value: "paid", label: TEXT.paid },
  { value: "all", label: TEXT.all },
];

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function formatKRW(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}\uC6D0`;
}

function dueDateLabel(isoString: string): { label: string; overdue: boolean } {
  const dueDate = new Date(isoString);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = dueDate.getTime() - todayStart.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return { label: "D-Day", overdue: false };
  if (diffDays > 0) return { label: `D-${diffDays}`, overdue: false };
  return { label: `D+${Math.abs(diffDays)}`, overdue: true };
}

function getInstallmentStatus(item: InstallmentItem): "paid" | "overdue" | "upcoming" {
  if (item.paidAt) return "paid";

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(item.dueDate) < todayStart ? "overdue" : "upcoming";
}

function formatPaymentDescription(item: InstallmentItem) {
  return item.payment.firstItemName ?? PAYMENT_CATEGORY_LABEL[item.payment.category] ?? TEXT.paymentFallback;
}

function formatConfirmMessage(item: InstallmentItem) {
  return TEXT.confirmPayment
    .replace("{round}", `${item.seq}`)
    .replace("{amount}", formatKRW(item.amount))
    .replace("{name}", item.payment.student?.name ?? item.payment.examNumber ?? TEXT.none);
}

export function InstallmentManager({ initialItems, initialStatus, summary }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StatusFilter>(initialStatus);
  const [items, setItems] = useState<InstallmentItem[]>(initialItems);
  const [total, setTotal] = useState(initialItems.length);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [summaryState, setSummaryState] = useState(summary);

  const fetchItems = useCallback(async (status: StatusFilter) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payments/installments?status=${status}&page=1`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? TEXT.loadFailed);
        return;
      }
      setItems(json.data.items);
      setTotal(json.data.total);
      setSummaryState(json.data.summary);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleTabChange(tab: StatusFilter) {
    setActiveTab(tab);
    void fetchItems(tab);
  }

  async function fetchSummary() {
    try {
      const res = await fetch("/api/payments/installments?status=all&page=1");
      const json = await res.json();
      if (res.ok) {
        setSummaryState(json.data.summary);
      }
    } catch {
      // ignore refresh failure
    }
  }

  async function handleMarkPaid(item: InstallmentItem) {
    if (!confirm(formatConfirmMessage(item))) return;

    setProcessingId(item.id);
    try {
      const res = await fetch(`/api/payments/installments/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAt: new Date().toISOString() }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? TEXT.loadFailed);
        return;
      }

      const paidAt = json.data.paidAt as string;
      setItems((prev) => prev.map((current) => (current.id === item.id ? { ...current, paidAt } : current)));

      if (activeTab === "overdue" || activeTab === "upcoming") {
        setItems((prev) => prev.filter((current) => current.id !== item.id));
        setTotal((prev) => Math.max(0, prev - 1));
      }

      toast.success(TEXT.paymentDone);
      void fetchSummary();
      router.refresh();
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.value;
          const count =
            tab.value === "overdue"
              ? summaryState.overdueCount
              : tab.value === "upcoming"
                ? summaryState.upcomingCount
                : tab.value === "paid"
                  ? summaryState.paidCount
                  : null;

          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleTabChange(tab.value)}
              disabled={loading}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-60",
                isActive
                  ? "border-ember bg-ember text-white"
                  : "border-ink/20 bg-white text-ink hover:border-ember/40 hover:text-ember",
              ].join(" ")}
            >
              {tab.label}
              {count !== null ? (
                <span
                  className={[
                    "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                    isActive
                      ? "bg-white/30 text-white"
                      : tab.value === "overdue"
                        ? "bg-red-50 text-red-700"
                        : "bg-mist text-slate",
                  ].join(" ")}
                >
                  {count.toLocaleString()}
                </span>
              ) : null}
            </button>
          );
        })}

        <span className="ml-auto text-sm text-slate">
          {loading ? TEXT.loading : `${total.toLocaleString()}${TEXT.totalSuffix}`}
        </span>
      </div>

      <div className="overflow-hidden rounded-[20px] border border-ink/10 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-ember/20 border-t-ember" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-4xl">&#10003;</p>
            <p className="mt-4 text-lg font-medium text-ink">
              {activeTab === "overdue"
                ? TEXT.emptyOverdue
                : activeTab === "upcoming"
                  ? TEXT.emptyUpcoming
                  : activeTab === "paid"
                    ? TEXT.emptyPaid
                    : TEXT.emptyAll}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <caption className="sr-only">분할 납부 현황과 납부 처리 목록</caption>
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  {[TEXT.student, TEXT.payment, TEXT.round, TEXT.dueDate, TEXT.amount, TEXT.status, TEXT.detail, TEXT.action].map((header) => (
                    <th
                      key={header}
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate whitespace-nowrap"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {items.map((item) => {
                  const status = getInstallmentStatus(item);
                  const badge = STATUS_BADGE[status];
                  const isProcessing = processingId === item.id;
                  const dueInfo = item.paidAt
                    ? { label: formatDate(item.paidAt), overdue: false }
                    : dueDateLabel(item.dueDate);

                  return (
                    <tr
                      key={item.id}
                      className={[
                        "transition-colors hover:bg-mist/50",
                        status === "overdue"
                          ? "border-l-4 border-l-red-400"
                          : status === "upcoming"
                            ? "border-l-4 border-l-amber-300"
                            : "border-l-4 border-l-forest/40",
                      ].join(" ")}
                    >
                      <td className="px-5 py-4">
                        {item.payment.examNumber ? (
                          <a
                            href={`/admin/students/${item.payment.examNumber}`}
                            className="font-medium text-ink hover:text-forest hover:underline"
                          >
                            {item.payment.student?.name ?? item.payment.examNumber}
                          </a>
                        ) : (
                          <span className="font-medium text-ink">
                            {item.payment.student?.name ?? TEXT.none}
                          </span>
                        )}
                        <div className="mt-1 space-y-1 text-xs text-slate">
                          {item.payment.examNumber ? (
                            <p className="font-mono">{item.payment.examNumber}</p>
                          ) : null}
                          <p>{item.payment.student?.phone ?? TEXT.phoneMissing}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {item.payment.student?.enrollments.length ? (
                              item.payment.student.enrollments.map((enrollment) => (
                                <a
                                  key={enrollment.id}
                                  href={`/admin/enrollments/${enrollment.id}`}
                                  className="rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[11px] text-slate transition hover:border-ink/30 hover:text-ink"
                                >
                                  {enrollment.label}
                                </a>
                              ))
                            ) : (
                              <span>{TEXT.enrollmentsMissing}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <a
                          href={`/admin/payments/${item.paymentId}`}
                          className="font-medium text-forest hover:underline"
                        >
                          {formatPaymentDescription(item)}
                        </a>
                        <p className="mt-0.5 font-mono text-xs text-slate">
                          {formatKRW(item.payment.netAmount)}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink/5 text-xs font-semibold text-ink">
                          {item.seq}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-mono text-xs text-ink">{formatDate(item.dueDate)}</p>
                        {item.paidAt ? (
                          <p className="mt-0.5 text-xs text-forest">
                            {TEXT.paidOn} {dueInfo.label}
                          </p>
                        ) : (
                          <p
                            className={[
                              "mt-0.5 text-xs font-semibold",
                              dueInfo.overdue ? "text-red-600" : "text-amber-600",
                            ].join(" ")}
                          >
                            {dueInfo.label}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4 font-mono text-sm font-semibold text-ink tabular-nums">
                        {formatKRW(item.amount)}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={[
                            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                            badge.className,
                          ].join(" ")}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <a
                          href={`/admin/payments/installments/${item.id}`}
                          className="inline-flex items-center rounded-full border border-ink/20 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:border-ember/40 hover:text-ember whitespace-nowrap"
                        >
                          {TEXT.viewDetail}
                        </a>
                      </td>
                      <td className="px-5 py-4">
                        {item.paidAt === null ? (
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => void handleMarkPaid(item)}
                            className={[
                              "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap",
                              status === "overdue"
                                ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                                : "border-ember/30 bg-ember/10 text-ember hover:bg-ember/20",
                            ].join(" ")}
                          >
                            {isProcessing ? TEXT.processing : TEXT.processPayment}
                          </button>
                        ) : (
                          <span className="text-xs text-slate">{TEXT.paid}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
