"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

export type UnpaidInstallmentRow = {
  id: string;
  paymentId: string;
  enrollmentId: string | null;
  examNumber: string | null;
  studentName: string | null;
  mobile: string | null;
  courseName: string;
  enrollments: string[];
  seq: number;
  totalRounds: number;
  dueDate: string;
  amount: number;
  installmentStatus: "PENDING" | "OVERDUE";
  isThisWeek: boolean;
};

type FilterTab = "all" | "pending" | "overdue" | "thisWeek";

type Summary = {
  totalCount: number;
  pendingCount: number;
  overdueCount: number;
  thisWeekCount: number;
  totalUnpaidAmount: number;
};

function formatKRW(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}\uC6D0`;
}

function statusBadgeClass(status: UnpaidInstallmentRow["installmentStatus"]): string {
  return status === "OVERDUE"
    ? "border-red-200 bg-red-50 text-red-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
}

function statusLabel(status: UnpaidInstallmentRow["installmentStatus"]): string {
  return status === "OVERDUE" ? "\uC5F0\uCC28" : "\uBBF8\uB0A9";
}

function rowAccentClass(status: UnpaidInstallmentRow["installmentStatus"]): string {
  return status === "OVERDUE" ? "border-l-4 border-l-red-400" : "border-l-4 border-l-amber-400";
}

type RemindState = "idle" | "loading" | "sent" | "error";

function RemindButton({ row }: { row: UnpaidInstallmentRow }) {
  const [state, setState] = useState<RemindState>("idle");
  const [tooltip, setTooltip] = useState("");

  async function handleRemind() {
    if (state === "loading" || state === "sent") return;

    setState("loading");
    setTooltip("");

    try {
      const res = await fetch("/api/payments/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examNumber: row.examNumber,
          enrollmentId: row.enrollmentId,
          unpaidAmount: row.amount,
          courseName: row.courseName,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        data?: { sent: boolean; message: string };
        error?: string;
      };

      if (!res.ok || json.error) {
        setState("error");
        setTooltip(json.error ?? "\uBC1C\uC1A1 \uC2E4\uD328");
        setTimeout(() => setState("idle"), 4000);
        return;
      }

      setState("sent");
      setTooltip(json.data?.message ?? "\uBC1C\uC1A1 \uC644\uB8CC");
    } catch {
      setState("error");
      setTooltip("\uB124\uD2B8\uC6CC\uD06C \uC624\uB958");
      setTimeout(() => setState("idle"), 4000);
    }
  }

  if (state === "sent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-forest/30 bg-forest/10 px-3 py-1.5 text-xs font-medium text-forest">
        \uBC1C\uC1A1 \uC644\uB8CC
      </span>
    );
  }

  return (
    <div className="relative inline-flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={handleRemind}
        disabled={state === "loading"}
        className={[
          "inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
          state === "loading"
            ? "cursor-not-allowed border-ink/20 bg-ink/5 text-ink/40"
            : state === "error"
              ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
              : "border-amber-300 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100",
        ].join(" ")}
      >
        {state === "loading" ? (
          <>
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            \uBC1C\uC1A1 \uC911
          </>
        ) : state === "error" ? (
          "\uB2E4\uC2DC \uC2DC\uB3C4"
        ) : (
          "\uBBF8\uB0A9 \uC548\uB0B4"
        )}
      </button>
      {tooltip ? (
        <span className="absolute top-full z-10 mt-1 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[10px] text-white shadow-lg">
          {tooltip}
        </span>
      ) : null}
    </div>
  );
}

type BulkToast = {
  type: "success" | "error" | "partial";
  message: string;
};

const TABS: { value: FilterTab; labelKey: keyof Summary; label: string }[] = [
  { value: "all", labelKey: "totalCount", label: "\uC804\uCCB4" },
  { value: "pending", labelKey: "pendingCount", label: "\uBBF8\uB0A9" },
  { value: "overdue", labelKey: "overdueCount", label: "\uC5F0\uCC28" },
  { value: "thisWeek", labelKey: "thisWeekCount", label: "\uC774\uBC88 \uC8FC" },
];

export function UnpaidListClient({
  rows,
  summary,
}: {
  rows: UnpaidInstallmentRow[];
  summary: Summary;
}) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [toast, setToast] = useState<BulkToast | null>(null);

  const filtered = rows.filter((row) => {
    if (activeTab === "all") return true;
    if (activeTab === "pending") return row.installmentStatus === "PENDING";
    if (activeTab === "overdue") return row.installmentStatus === "OVERDUE";
    if (activeTab === "thisWeek") return row.isThisWeek;
    return true;
  });

  const filteredUnpaidAmount = filtered.reduce((sum, row) => sum + row.amount, 0);
  const remindableFiltered = filtered.filter((row) => row.examNumber);
  const allRemindableSelected =
    remindableFiltered.length > 0 &&
    remindableFiltered.every((row) => selectedIds.has(row.id));
  const someSelected = selectedIds.size > 0;

  const handleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allRemindableSelected) {
        remindableFiltered.forEach((row) => next.delete(row.id));
      } else {
        remindableFiltered.forEach((row) => next.add(row.id));
      }
      return next;
    });
  }, [allRemindableSelected, remindableFiltered]);

  const handleToggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function showToast(next: BulkToast) {
    setToast(next);
    setTimeout(() => setToast(null), 5000);
  }

  async function handleBulkRemind() {
    if (bulkLoading || selectedIds.size === 0) return;

    const selectedRows = rows.filter((row) => selectedIds.has(row.id) && row.examNumber);
    if (selectedRows.length === 0) {
      showToast({ type: "error", message: "\uC120\uD0DD\uD55C \uB300\uC0C1\uC5D0 \uBC1C\uC1A1 \uAC00\uB2A5\uD55C \uD559\uC0DD\uC774 \uC5C6\uC2B5\uB2C8\uB2E4." });
      return;
    }

    setBulkLoading(true);

    try {
      const items = selectedRows.map((row) => ({
        examNumber: row.examNumber as string,
        enrollmentId: row.enrollmentId ?? undefined,
        unpaidAmount: row.amount,
        courseName: row.courseName,
      }));

      const res = await fetch("/api/payments/remind-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      const json = (await res.json()) as {
        data?: { sent: number; failed: number; errors: string[] };
        error?: string;
      };

      if (!res.ok || json.error) {
        showToast({ type: "error", message: json.error ?? "\uBC1C\uC1A1 \uC2E4\uD328" });
        return;
      }

      const { sent = 0, failed = 0 } = json.data ?? {};
      if (failed === 0) {
        showToast({ type: "success", message: `${sent}\uAC74 \uBC1C\uC1A1 \uC644\uB8CC` });
        setSelectedIds(new Set());
      } else if (sent > 0) {
        showToast({ type: "partial", message: `${sent}\uAC74 \uBC1C\uC1A1 \uC644\uB8CC, ${failed}\uAC74 \uC2E4\uD328` });
      } else {
        showToast({ type: "error", message: `\uC804\uCCB4 ${failed}\uAC74 \uBC1C\uC1A1 \uC2E4\uD328` });
      }
    } catch {
      showToast({ type: "error", message: "\uB124\uD2B8\uC6CC\uD06C \uC624\uB958" });
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div>
      {toast ? (
        <div
          className={[
            "mb-4 flex items-center justify-between rounded-2xl border px-5 py-3 text-sm font-medium shadow-sm",
            toast.type === "success"
              ? "border-forest/30 bg-forest/10 text-forest"
              : toast.type === "partial"
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-red-300 bg-red-50 text-red-700",
          ].join(" ")}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-4 text-current opacity-60 hover:opacity-100"
            aria-label="\uB2EB\uAE30"
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map((tab) => {
          const count = summary[tab.labelKey] as number;
          const isActive = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-ember bg-ember text-white"
                  : "border-ink/20 bg-white text-ink hover:border-ember/40 hover:text-ember",
              ].join(" ")}
            >
              {tab.label}
              <span
                className={[
                  "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold",
                  isActive
                    ? "bg-white/30 text-white"
                    : tab.value === "overdue"
                      ? "bg-red-50 text-red-700"
                      : tab.value === "pending"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-mist text-slate",
                ].join(" ")}
              >
                {count.toLocaleString()}
              </span>
            </button>
          );
        })}

        <span className="ml-auto text-sm text-slate">
          {filtered.length.toLocaleString()}\uAC74 /{" "}
          <span className="font-semibold text-ember">{formatKRW(filteredUnpaidAmount)}</span>
        </span>
      </div>

      {someSelected ? (
        <div className="mb-3 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="text-sm font-medium text-amber-800">
            {selectedIds.size}\uAC74 \uC120\uD0DD\uB428
          </span>
          <button
            type="button"
            onClick={handleBulkRemind}
            disabled={bulkLoading}
            className={[
              "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              bulkLoading
                ? "cursor-not-allowed bg-ink/10 text-ink/40"
                : "bg-amber-500 text-white hover:bg-amber-600 shadow-sm",
            ].join(" ")}
          >
            {bulkLoading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                \uBC1C\uC1A1 \uC911
              </>
            ) : (
              `\uC120\uD0DD\uD55C ${selectedIds.size}\uAC74 \uBBF8\uB0A9 \uC548\uB0B4 \uBC1C\uC1A1`
            )}
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-amber-700 underline hover:text-amber-900"
          >
            \uC120\uD0DD \uD574\uC81C
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[20px] border border-ink/10 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-forest/20 bg-forest/10 text-forest">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="mt-4 text-lg font-medium text-ink">
              {activeTab === "overdue"
                ? "\uC5F0\uCC28\uB41C \uBBF8\uB0A9 \uAC74\uC774 \uC5C6\uC2B5\uB2C8\uB2E4"
                : activeTab === "pending"
                  ? "\uBBF8\uB0A9 \uC608\uC815 \uAC74\uC774 \uC5C6\uC2B5\uB2C8\uB2E4"
                  : activeTab === "thisWeek"
                    ? "\uC774\uBC88 \uC8FC \uB9C8\uAC10 \uAC74\uC774 \uC5C6\uC2B5\uB2C8\uB2E4"
                    : "\uBBF8\uB0A9 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4"}
            </p>
            <p className="mt-2 text-sm text-slate">
              \uC120\uD0DD\uD55C \uC870\uAC74\uC5D0 \uD574\uB2F9\uD558\uB294 \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  <th className="w-10 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={allRemindableSelected}
                      onChange={handleSelectAll}
                      disabled={remindableFiltered.length === 0}
                      title="\uC804\uCCB4 \uC120\uD0DD"
                      className="h-4 w-4 cursor-pointer rounded border-ink/30 text-amber-500 accent-amber-500"
                    />
                  </th>
                  {[
                    "\uD559\uC0DD",
                    "\uD559\uBC88",
                    "\uC5F0\uB77D\uCC98",
                    "\uC218\uAC15\uB0B4\uC5ED",
                    "\uAC15\uC88C",
                    "\uBBF8\uB0A9 \uD68C\uCC28",
                    "\uB0A9\uBD80 \uAE30\uD55C",
                    "\uAE08\uC561",
                    "\uC0C1\uD0DC",
                    "\uC218\uB0A9\uD558\uAE30",
                    "\uBBF8\uB0A9 \uC548\uB0B4",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate whitespace-nowrap"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-ink/5">
                {filtered.map((row) => {
                  const isChecked = selectedIds.has(row.id);
                  const canSelect = !!row.examNumber;

                  return (
                    <tr
                      key={row.id}
                      className={[
                        rowAccentClass(row.installmentStatus),
                        isChecked ? "bg-amber-50/60" : "transition-colors hover:bg-mist/60",
                      ].join(" ")}
                    >
                      <td className="w-10 px-3 py-4 text-center">
                        {canSelect ? (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleRow(row.id)}
                            className="h-4 w-4 cursor-pointer rounded border-ink/30 text-amber-500 accent-amber-500"
                          />
                        ) : (
                          <span className="text-xs text-slate/30">-</span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {row.examNumber ? (
                          <Link
                            href={`/admin/students/${row.examNumber}`}
                            className="font-medium text-ink hover:text-forest hover:underline"
                          >
                            {row.studentName ?? "\uD559\uC0DD \uC5C6\uC74C"}
                          </Link>
                        ) : (
                          <span className="font-medium text-ink">
                            {row.studentName ?? "\uD559\uC0DD \uC5C6\uC74C"}
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {row.examNumber ? (
                          <Link
                            href={`/admin/students/${row.examNumber}`}
                            className="font-mono text-xs font-medium text-forest hover:underline"
                          >
                            {row.examNumber}
                          </Link>
                        ) : (
                          <span className="text-slate">-</span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-ink">
                        {row.mobile ?? <span className="text-slate">-</span>}
                      </td>

                      <td className="px-5 py-4">
                        {row.enrollments.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {row.enrollments.map((item) => (
                              <span
                                key={item}
                                className="inline-flex rounded-full border border-ink/10 bg-mist px-2 py-0.5 text-[11px] font-medium text-slate"
                              >
                                {item}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate">\uC218\uAC15\uB0B4\uC5ED \uC5C6\uC74C</span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-ink">{row.courseName}</td>

                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex items-center gap-0.5 rounded-full border border-ink/20 bg-ink/5 px-2.5 py-0.5 font-mono text-xs font-semibold text-ink">
                          {row.seq}
                          <span className="text-slate/60">/{row.totalRounds}</span>
                        </span>
                      </td>

                      <td className="px-5 py-4 font-mono text-xs text-ink">
                        {row.dueDate}
                        {row.isThisWeek && row.installmentStatus !== "OVERDUE" ? (
                          <span className="ml-1.5 inline-flex rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                            \uC774\uBC88 \uC8FC
                          </span>
                        ) : null}
                      </td>

                      <td className="px-5 py-4 font-mono text-sm font-semibold text-ink tabular-nums">
                        {formatKRW(row.amount)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={[
                            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                            statusBadgeClass(row.installmentStatus),
                          ].join(" ")}
                        >
                          {statusLabel(row.installmentStatus)}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <Link
                          href={
                            row.enrollmentId
                              ? `/admin/payments/new?enrollmentId=${row.enrollmentId}`
                              : "/admin/payments/new"
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-ember/30 bg-ember/5 px-3 py-1.5 text-xs font-medium text-ember transition-colors hover:border-ember hover:bg-ember hover:text-white"
                        >
                          \uC218\uB0A9\uD558\uAE30
                        </Link>
                      </td>

                      <td className="px-5 py-4">
                        {row.examNumber ? (
                          <RemindButton row={row} />
                        ) : (
                          <span className="text-xs text-slate">\uBC1C\uC1A1 \uBD88\uAC00</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist/80">
                  <td className="px-3 py-3" />
                  <td colSpan={5} className="px-5 py-3 text-xs font-semibold text-slate">
                    \uD569\uACC4 ({filtered.length.toLocaleString()}\uAC74)
                  </td>
                  <td className="px-5 py-3 text-left font-mono text-sm font-semibold text-ember tabular-nums">
                    {formatKRW(filteredUnpaidAmount)}
                  </td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
