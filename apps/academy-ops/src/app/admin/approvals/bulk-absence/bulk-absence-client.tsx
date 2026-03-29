"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { AbsenceNoteRow } from "./page";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  MILITARY: "군사",
  MEDICAL: "병결",
  FAMILY: "가사",
  OTHER: "기타",
};

type FilterKey = "ALL" | "MILITARY" | "MEDICAL" | "FAMILY" | "OTHER";

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "MILITARY", label: "군사" },
  { key: "MEDICAL", label: "병결" },
  { key: "FAMILY", label: "가사" },
  { key: "OTHER", label: "기타" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// ─── Toast ────────────────────────────────────────────────────────────────────

type Toast = {
  id: number;
  message: string;
  type: "success" | "error";
};

// ─── Main Component ───────────────────────────────────────────────────────────

type Props = { initialRows: AbsenceNoteRow[] };

export function BulkAbsenceClient({ initialRows }: Props) {
  const router = useRouter();

  const [rows, setRows] = useState<AbsenceNoteRow[]>(initialRows);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [toastCounter, setToastCounter] = useState(0);

  // ── Filtered rows ──────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (filter === "ALL") return rows;
    return rows.filter((r) => r.absenceCategory === filter);
  }, [rows, filter]);

  // ── Selection helpers ──────────────────────────────────────────────────────
  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.id));

  function toggleAll() {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredRows.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredRows.forEach((r) => next.add(r.id));
        return next;
      });
    }
  }

  function toggleRow(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Toast helper ───────────────────────────────────────────────────────────
  function addToast(message: string, type: Toast["type"]) {
    const id = toastCounter + 1;
    setToastCounter(id);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }

  // ── Bulk actions ───────────────────────────────────────────────────────────
  const selectedIds = [...selected];

  async function handleBulkAction(action: "approve" | "reject") {
    if (selectedIds.length === 0) {
      addToast("처리할 항목을 선택하세요.", "error");
      return;
    }

    const actionLabel = action === "approve" ? "승인" : "반려";

    setLoading(true);
    try {
      const endpoint =
        action === "approve"
          ? "/api/approvals/absence-notes/bulk-approve"
          : "/api/approvals/absence-notes/bulk-reject";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: selectedIds,
          comment: comment.trim() || undefined,
        }),
      });

      const json = (await res.json()) as { data?: { updated: number }; error?: string };

      if (!res.ok) {
        addToast(json.error ?? `${actionLabel}에 실패했습니다.`, "error");
        return;
      }

      const updated = json.data?.updated ?? 0;
      addToast(`${updated}건을 ${actionLabel}했습니다.`, "success");

      // Remove processed rows from local state
      setRows((prev) => prev.filter((r) => !selected.has(r.id)));
      setSelected(new Set());
      setComment("");

      // Refresh server data
      router.refresh();
    } catch {
      addToast(`${actionLabel} 처리 중 오류가 발생했습니다.`, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 sm:p-10">
      {/* ── Toast container ── */}
      <div className="fixed right-6 top-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-3 rounded-2xl border px-5 py-3 text-sm font-medium shadow-lg transition-all ${
              t.type === "success"
                ? "border-forest/30 bg-white text-forest"
                : "border-red-200 bg-white text-red-700"
            }`}
          >
            <span
              className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                t.type === "success" ? "bg-forest/20 text-forest" : "bg-red-100 text-red-700"
              }`}
            >
              {t.type === "success" ? "✓" : "!"}
            </span>
            {t.message}
          </div>
        ))}
      </div>

      {/* ── Header ── */}
      <div className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-800">
        결재 관리
      </div>

      <div className="mt-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">결석계 일괄 처리</h1>
          <p className="mt-1 text-sm text-slate">
            대기 중인 결석계를 선택하여 한 번에 승인하거나 반려합니다.
          </p>
        </div>
        <a
          href="/admin/approvals"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          ← 결재 대기함
        </a>
      </div>

      {/* ── Filter bar (print:hidden) ── */}
      <div className="print:hidden mt-8 flex flex-wrap items-center justify-between gap-4">
        {/* Type filter */}
        <div className="flex gap-1 rounded-2xl border border-ink/10 bg-mist/60 p-1.5">
          {FILTER_OPTIONS.map((opt) => {
            const count =
              opt.key === "ALL"
                ? rows.length
                : rows.filter((r) => r.absenceCategory === opt.key).length;
            const active = filter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setFilter(opt.key)}
                className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                  active ? "bg-white text-ink shadow-sm" : "text-slate hover:text-ink"
                }`}
              >
                {opt.label}
                {count > 0 && (
                  <span
                    className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-xs font-semibold ${
                      active ? "bg-amber-100 text-amber-700" : "bg-ink/10 text-ink/60"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Count badge */}
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
            filteredRows.length > 0
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-forest/30 bg-forest/10 text-forest"
          }`}
        >
          {filteredRows.length > 0 ? `대기 ${filteredRows.length}건` : "대기 없음"}
        </span>
      </div>

      {/* ── Action bar ── */}
      {filteredRows.length > 0 && (
        <div className="print:hidden mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-ink/5 bg-mist/60 px-5 py-3">
          <button
            type="button"
            onClick={toggleAll}
            className="rounded-xl border border-ink/20 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
          >
            {allFilteredSelected ? "선택 해제" : "전체 선택"}
          </button>

          {selected.size > 0 && (
            <span className="text-sm text-slate">
              <strong className="text-ink">{selected.size}건</strong> 선택됨
            </span>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Comment input */}
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="처리 메모 (선택)"
              className="w-48 rounded-xl border border-ink/20 bg-white px-3 py-2 text-sm text-ink placeholder:text-slate/50 focus:border-ember/50 focus:outline-none focus:ring-2 focus:ring-ember/10"
            />

            <button
              type="button"
              disabled={loading || selected.size === 0}
              onClick={() => handleBulkAction("approve")}
              className="rounded-xl border border-forest/30 bg-forest/10 px-4 py-2 text-sm font-semibold text-forest transition hover:bg-forest/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "처리 중..." : `일괄 승인 (${selected.size}건)`}
            </button>

            <button
              type="button"
              disabled={loading || selected.size === 0}
              onClick={() => handleBulkAction("reject")}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "처리 중..." : `일괄 반려 (${selected.size}건)`}
            </button>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      <div className="mt-4">
        {filteredRows.length === 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-12 text-center">
            <p className="text-sm text-slate">
              {rows.length === 0
                ? "대기 중인 결석계가 없습니다."
                : "선택한 유형의 대기 결석계가 없습니다."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate">
                      <span className="sr-only">선택</span>
                    </th>
                    {["학번", "이름", "시험 날짜", "사유", "유형", "제출일"].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {filteredRows.map((row) => {
                    const isChecked = selected.has(row.id);
                    return (
                      <tr
                        key={row.id}
                        onClick={() => toggleRow(row.id)}
                        className={`cursor-pointer transition-colors ${
                          isChecked ? "bg-amber-50/60" : "hover:bg-mist/30"
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleRow(row.id)}
                            className="h-4 w-4 rounded border-ink/30 accent-ember"
                          />
                        </td>
                        {/* 학번 */}
                        <td className="whitespace-nowrap px-4 py-3 text-xs">
                          <a
                            href={`/admin/students/${row.examNumber}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium text-ink transition-colors hover:text-ember"
                          >
                            {row.examNumber}
                          </a>
                        </td>
                        {/* 이름 */}
                        <td className="whitespace-nowrap px-4 py-3">
                          <a
                            href={`/admin/students/${row.examNumber}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium text-ink transition-colors hover:text-ember"
                          >
                            {row.studentName}
                          </a>
                        </td>
                        {/* 시험 날짜 */}
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate tabular-nums">
                          {fmtDate(row.sessionDate)}
                        </td>
                        {/* 사유 */}
                        <td className="max-w-[240px] truncate px-4 py-3 text-slate">
                          {row.reason}
                        </td>
                        {/* 유형 */}
                        <td className="whitespace-nowrap px-4 py-3">
                          {row.absenceCategory ? (
                            <span className="inline-flex rounded-full border border-ink/10 bg-mist/60 px-2 py-0.5 text-xs font-medium text-ink">
                              {CATEGORY_LABEL[row.absenceCategory] ?? row.absenceCategory}
                            </span>
                          ) : (
                            <span className="text-xs text-slate">—</span>
                          )}
                        </td>
                        {/* 제출일 */}
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate tabular-nums">
                          {row.submittedAt ? fmtDate(row.submittedAt) : fmtDate(row.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="border-t border-ink/5 bg-mist/40 px-5 py-3">
              <p className="text-xs text-slate">
                총 {rows.length}건 대기 중 · 현재 필터: {filteredRows.length}건 표시 ·{" "}
                {selected.size > 0 ? (
                  <strong className="text-ink">{selected.size}건 선택됨</strong>
                ) : (
                  "선택 없음"
                )}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
