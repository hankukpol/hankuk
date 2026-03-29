"use client";

import { useState, useTransition } from "react";
import { AbsenceCategory, AbsenceStatus, Subject } from "@prisma/client";
import { toast } from "sonner";
import { ABSENCE_CATEGORY_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";

// ── Types ──────────────────────────────────────────────────────────────────────

export type BulkManagerNote = {
  id: number;
  examNumber: string;
  status: AbsenceStatus;
  reason: string;
  absenceCategory: AbsenceCategory | null;
  submittedAt: string | null;
  student: {
    name: string;
    phone: string | null;
  };
  session: {
    examDate: string;
    week: number;
    subject: Subject;
  };
};

type BulkManagerClientProps = {
  notes: BulkManagerNote[];
};

// ── Status badge ───────────────────────────────────────────────────────────────

const NOTE_STATUS_CLASS: Record<AbsenceStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-forest/20 bg-forest/10 text-forest",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
};

const NOTE_STATUS_LABEL: Record<AbsenceStatus, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "반려",
};

// ── Component ──────────────────────────────────────────────────────────────────

export function BulkManagerClient({ notes: initialNotes }: BulkManagerClientProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isPending, startTransition] = useTransition();

  const pendingNotes = notes.filter((n) => n.status === AbsenceStatus.PENDING);
  const allSelected =
    pendingNotes.length > 0 && pendingNotes.every((n) => selectedIds.includes(n.id));

  function toggleRow(id: number, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? pendingNotes.map((n) => n.id) : []);
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  async function bulkAction(action: "approve" | "reject") {
    if (selectedIds.length === 0) return;

    const label = action === "approve" ? "승인" : "반려";
    const confirmed = window.confirm(
      `선택한 ${selectedIds.length}건을 일괄 ${label} 처리할까요?`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      try {
        const res = await fetch("/api/absence-notes/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ids: selectedIds }),
        });

        const payload = (await res.json()) as {
          succeeded?: number;
          failed?: number;
          error?: string;
        };

        if (!res.ok) {
          throw new Error(payload.error ?? "요청에 실패했습니다.");
        }

        const successMsg = `${payload.succeeded ?? 0}건 ${label} 완료${(payload.failed ?? 0) > 0 ? `, ${payload.failed}건 실패` : ""}`;
        toast.success(successMsg);

        // Update local state: remove processed notes from PENDING
        const processedIds = new Set(selectedIds);
        const newStatus = action === "approve" ? AbsenceStatus.APPROVED : AbsenceStatus.REJECTED;
        setNotes((prev) =>
          prev.map((n) =>
            processedIds.has(n.id) ? { ...n, status: newStatus } : n,
          ),
        );
        setSelectedIds([]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "처리에 실패했습니다.";
        toast.error(msg);
      }
    });
  }

  if (notes.length === 0) {
    return (
      <div className="mt-6 rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
        대기 중인 사유서가 없습니다.
      </div>
    );
  }

  return (
    <>
      {/* Summary badges */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
          대기 {pendingNotes.length}건
        </span>
        <span className="inline-flex rounded-full border border-ink/10 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate">
          전체 {notes.length}건
        </span>
        {selectedIds.length > 0 && (
          <span className="inline-flex rounded-full border border-ember/20 bg-ember/10 px-2.5 py-0.5 text-xs font-semibold text-ember">
            {selectedIds.length}건 선택됨
          </span>
        )}
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10">
        <table className="w-full text-sm">
          <caption className="sr-only">
            대기 사유서 목록 — 체크박스로 선택 후 일괄 승인/반려 처리
          </caption>
          <thead>
            <tr className="border-b border-ink/10 bg-mist/60 text-left text-xs font-semibold text-slate">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer"
                  aria-label="대기 사유서 전체 선택"
                  checked={allSelected}
                  disabled={pendingNotes.length === 0}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              <th className="px-4 py-3">수험번호 · 이름</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">사유 유형</th>
              <th className="px-4 py-3">사유 요약</th>
              <th className="px-4 py-3">회차</th>
              <th className="px-4 py-3">제출일시</th>
              <th className="px-4 py-3">상세</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {notes.map((note) => {
              const isPending = note.status === AbsenceStatus.PENDING;
              const isSelected = selectedIds.includes(note.id);

              return (
                <tr
                  key={note.id}
                  className={`transition-colors hover:bg-mist/40 ${isSelected ? "bg-amber-50/40" : ""}`}
                >
                  <td className="px-4 py-3">
                    {isPending ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer"
                        aria-label={`${note.examNumber} 사유서 선택`}
                        checked={isSelected}
                        onChange={(e) => toggleRow(note.id, e.target.checked)}
                      />
                    ) : (
                      <div className="h-4 w-4" />
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <a
                      href={`/admin/students/${note.examNumber}`}
                      className="hover:text-ember hover:underline"
                    >
                      {note.examNumber}
                    </a>
                    {" · "}
                    {note.student.name}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${NOTE_STATUS_CLASS[note.status]}`}
                    >
                      {NOTE_STATUS_LABEL[note.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {note.absenceCategory
                      ? ABSENCE_CATEGORY_LABEL[note.absenceCategory]
                      : "-"}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-slate">
                    {note.reason}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate">
                    {formatDate(note.session.examDate)} · {note.session.week}주차 · {SUBJECT_LABEL[note.session.subject]}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate">
                    {note.submittedAt ? formatDateTime(note.submittedAt) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/admin/absence-notes/${note.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-ink transition hover:border-ember/30 hover:text-ember"
                    >
                      상세
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Fixed bottom action bar */}
      {selectedIds.length > 0 && <div className="h-20" />}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-ink/10 bg-white/95 px-4 py-3 shadow-lg backdrop-blur lg:left-[260px] sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold text-ink">
              {selectedIds.length}건 선택됨
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => bulkAction("approve")}
                disabled={isPending}
                className="inline-flex items-center rounded-full bg-forest px-5 py-2 text-sm font-semibold text-white transition hover:bg-forest/80 disabled:opacity-50"
              >
                일괄 승인
              </button>
              <button
                type="button"
                onClick={() => bulkAction("reject")}
                disabled={isPending}
                className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
              >
                일괄 반려
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={isPending}
                className="inline-flex items-center rounded-full border border-ink/10 bg-white px-5 py-2 text-sm font-semibold text-slate transition hover:bg-mist disabled:opacity-50"
              >
                선택 해제
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
