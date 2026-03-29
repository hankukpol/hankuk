"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UnlinkedPaymentRow = {
  id: string;
  processedAt: string; // ISO string
  netAmount: number;
  method: string;
  status: string;
  linkTitle: string | null;
  linkToken: string | null;
  paymentLinkId: number | null;
  itemSummary: string;
  note: string | null;
};

type StudentSearchResult = {
  examNumber: string;
  name: string;
  mobile: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ` +
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  );
}

const METHOD_LABEL: Record<string, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  POINT: "포인트",
  MIXED: "혼합",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "처리 중",
  APPROVED: "완납",
  PARTIAL_REFUNDED: "부분 환불",
  FULLY_REFUNDED: "전액 환불",
  CANCELLED: "취소",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  APPROVED: "border-forest/30 bg-forest/10 text-forest",
  PARTIAL_REFUNDED: "border-orange-200 bg-orange-50 text-orange-700",
  FULLY_REFUNDED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-ink/20 bg-ink/5 text-slate",
};

// ─── Student Search & Link Modal ──────────────────────────────────────────────

function LinkStudentModal({
  payment,
  onClose,
  onLinked,
}: {
  payment: UnlinkedPaymentRow;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<StudentSearchResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState("");
  const [searchError, setSearchError] = useState("");

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError("");
    setResults([]);
    setSelected(null);

    try {
      const res = await fetch(
        `/api/students?search=${encodeURIComponent(query.trim())}&pageSize=10&activeOnly=false`,
      );
      const json = (await res.json()) as {
        students?: StudentSearchResult[];
        data?: StudentSearchResult[];
        error?: string;
      };
      if (!res.ok || json.error) {
        setSearchError(json.error ?? "검색 실패");
      } else {
        const list = json.students ?? json.data ?? [];
        setResults(list);
        if (list.length === 0) setSearchError("검색 결과가 없습니다.");
      }
    } catch {
      setSearchError("네트워크 오류");
    } finally {
      setSearching(false);
    }
  }

  function handleConfirm() {
    if (!selected) return;
    setErrorMsg("");

    startTransition(async () => {
      try {
        const res = await fetch(`/api/payments/${payment.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ examNumber: selected.examNumber }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok || json.error) {
          setErrorMsg(json.error ?? "연결 실패");
          return;
        }
        onLinked();
      } catch {
        setErrorMsg("네트워크 오류");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-4 w-full max-w-lg rounded-[28px] border border-ink/10 bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-ink/10 px-6 py-5">
          <div className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-ember">
            학생 연결
          </div>
          <h2 className="mt-2 text-lg font-semibold text-ink">미연결 결제에 학생 연결</h2>
          <p className="mt-1 text-sm text-slate">
            {formatDateTime(payment.processedAt)} &mdash;{" "}
            <span className="font-medium text-ember">{formatKRW(payment.netAmount)}</span>
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Search */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate">이름 또는 학번으로 검색</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSearch();
                }}
                placeholder="이름 또는 학번"
                className="flex-1 rounded-xl border border-ink/20 px-3 py-2 text-sm text-ink outline-none placeholder:text-slate focus:border-ember focus:ring-1 focus:ring-ember"
              />
              <button
                type="button"
                onClick={() => void handleSearch()}
                disabled={searching || !query.trim()}
                className="rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-50"
              >
                {searching ? "검색 중..." : "검색"}
              </button>
            </div>
            {searchError && <p className="mt-1 text-xs text-red-600">{searchError}</p>}
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-ink/10">
              {results.map((s) => (
                <button
                  key={s.examNumber}
                  type="button"
                  onClick={() => setSelected(s)}
                  className={[
                    "flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors hover:bg-mist/60",
                    selected?.examNumber === s.examNumber
                      ? "bg-ember/5 font-medium text-ink"
                      : "text-ink",
                  ].join(" ")}
                >
                  <span className="flex items-center gap-2">
                    {selected?.examNumber === s.examNumber && (
                      <span className="text-ember">✓</span>
                    )}
                    <span className="font-medium">{s.name}</span>
                  </span>
                  <span className="flex items-center gap-3 text-xs text-slate">
                    <span className="font-mono">{s.examNumber}</span>
                    {s.mobile && <span>{s.mobile}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Selected preview */}
          {selected && (
            <div className="rounded-xl border border-forest/20 bg-forest/5 px-4 py-3 text-sm">
              <p className="font-semibold text-forest">선택된 학생</p>
              <p className="mt-0.5 text-ink">
                {selected.name}{" "}
                <span className="font-mono text-xs text-slate">({selected.examNumber})</span>
              </p>
            </div>
          )}

          {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-ink/10 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-ink/20 px-5 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selected || isPending}
            className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-40"
          >
            {isPending ? "연결 중..." : "학생 연결"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UnlinkedPaymentsClient({
  initialRows,
  totalCount,
  totalAmount,
}: {
  initialRows: UnlinkedPaymentRow[];
  totalCount: number;
  totalAmount: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<UnlinkedPaymentRow[]>(initialRows);
  const [linkTarget, setLinkTarget] = useState<UnlinkedPaymentRow | null>(null);

  function handleLinked() {
    if (!linkTarget) return;
    setRows((prev) => prev.filter((r) => r.id !== linkTarget.id));
    setLinkTarget(null);
    router.refresh();
  }

  const linkedCount = totalCount - rows.length;

  return (
    <>
      {/* Linked-this-session notice */}
      {linkedCount > 0 && (
        <div className="mb-4 rounded-xl border border-forest/20 bg-forest/5 px-4 py-3 text-sm text-forest">
          이번 세션에서 {linkedCount}건을 학생에 연결했습니다.
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-[20px] border border-ink/10 bg-white shadow-sm">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-4xl text-forest">✓</div>
            <p className="mt-4 text-lg font-medium text-ink">미연결 결제가 없습니다</p>
            <p className="mt-2 text-sm text-slate">
              모든 온라인 결제가 학생에 연결되어 있습니다.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-mist">
                  {["결제일시", "결제 링크", "내역", "금액", "수단", "상태", ""].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {rows.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-mist/60">
                    {/* 결제일시 */}
                    <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-ink">
                      {formatDateTime(row.processedAt)}
                    </td>

                    {/* 결제 링크 */}
                    <td className="px-5 py-4">
                      {row.paymentLinkId ? (
                        <Link
                          href={`/admin/payment-links/${row.paymentLinkId}`}
                          className="text-forest hover:underline"
                        >
                          {row.linkTitle ?? `링크 #${row.paymentLinkId}`}
                        </Link>
                      ) : (
                        <span className="text-slate">—</span>
                      )}
                    </td>

                    {/* 내역 */}
                    <td className="px-5 py-4 text-ink">
                      {row.itemSummary}
                      {row.note && (
                        <span className="ml-1 text-xs text-slate">({row.note})</span>
                      )}
                    </td>

                    {/* 금액 */}
                    <td className="whitespace-nowrap px-5 py-4 font-mono font-semibold text-ink tabular-nums">
                      {formatKRW(row.netAmount)}
                    </td>

                    {/* 수단 */}
                    <td className="whitespace-nowrap px-5 py-4 text-slate">
                      {METHOD_LABEL[row.method] ?? row.method}
                    </td>

                    {/* 상태 */}
                    <td className="whitespace-nowrap px-5 py-4">
                      <span
                        className={[
                          "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                          STATUS_COLOR[row.status] ?? STATUS_COLOR.APPROVED,
                        ].join(" ")}
                      >
                        {STATUS_LABEL[row.status] ?? row.status}
                      </span>
                    </td>

                    {/* 학생 연결 버튼 */}
                    <td className="whitespace-nowrap px-5 py-4">
                      <button
                        type="button"
                        onClick={() => setLinkTarget(row)}
                        className="inline-flex items-center gap-1 rounded-lg border border-ember/30 bg-ember/5 px-3 py-1.5 text-xs font-medium text-ember transition-colors hover:border-ember hover:bg-ember hover:text-white"
                      >
                        학생 연결
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink/10 bg-mist/80">
                  <td colSpan={3} className="px-5 py-3 text-xs font-semibold text-slate">
                    합계 ({rows.length.toLocaleString()}건)
                  </td>
                  <td className="px-5 py-3 font-mono text-sm font-semibold text-ember tabular-nums">
                    {formatKRW(rows.reduce((s, r) => s + r.netAmount, 0))}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Link modal */}
      {linkTarget && (
        <LinkStudentModal
          payment={linkTarget}
          onClose={() => setLinkTarget(null)}
          onLinked={handleLinked}
        />
      )}
    </>
  );
}
