"use client";

import { AbsenceCategory, AbsenceStatus, StudentStatus, Subject } from "@prisma/client";
import { useState, useMemo, useTransition } from "react";
import { toast } from "sonner";
import { STATUS_BADGE_CLASS, STATUS_LABEL } from "@/lib/analytics/presentation";
import { ABSENCE_CATEGORY_LABEL, SUBJECT_LABEL } from "@/lib/constants";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import { formatDate, formatDateTime } from "@/lib/format";

// ── Types ──────────────────────────────────────────────────────────

type AbsenceNoteRow = {
  id: number;
  examNumber: string;
  sessionId: number;
  status: AbsenceStatus;
  absenceCategory: AbsenceCategory | null;
  attendCountsAsAttendance: boolean;
  attendGrantsPerfectAttendance: boolean;
  submittedAt: string | null;
  approvedAt: string | null;
  adminNote: string | null;
  reason: string;
  student: {
    name: string;
    currentStatus: StudentStatus;
  };
  session: {
    examDate: string;
    week: number;
    subject: Subject;
    period: {
      name: string;
    };
  };
  attachments: { id: number; originalFileName: string }[];
};

type SortColumn =
  | "examNumber"
  | "status"
  | "absenceCategory"
  | "examDate"
  | "submittedAt"
  | "attendCountsAsAttendance"
  | "attendGrantsPerfectAttendance";

// ── Constants ──────────────────────────────────────────────────────

const NOTE_STATUS_LABEL: Record<AbsenceStatus, string> = {
  PENDING: "대기",
  APPROVED: "승인",
  REJECTED: "반려",
};

const NOTE_STATUS_CLASS: Record<AbsenceStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-forest/20 bg-forest/10 text-forest",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
};

const STATUS_SORT_ORDER: Record<AbsenceStatus, number> = {
  PENDING: 0,
  REJECTED: 1,
  APPROVED: 2,
};

const PAGE_SIZE = 20;

// ── Helper components ──────────────────────────────────────────────

function SortIcon({
  column,
  sortBy,
  sortOrder,
}: {
  column: SortColumn;
  sortBy: SortColumn;
  sortOrder: "asc" | "desc";
}) {
  if (sortBy !== column) return <span className="ml-1 text-ink/20">⇅</span>;
  return (
    <span className="ml-1 text-ember">{sortOrder === "asc" ? "↑" : "↓"}</span>
  );
}

// ── Main component ─────────────────────────────────────────────────

type AbsenceNotesListClientProps = {
  notes: AbsenceNoteRow[];
};

export function AbsenceNotesListClient({ notes }: AbsenceNotesListClientProps) {
  // ── Sort / page state ─────────────────────────────────────────
  const [sortBy, setSortBy] = useState<SortColumn>("status");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);

  // ── Bulk-select state ──────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // ── Async state ────────────────────────────────────────────────
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();
  const completionModal = useActionModalState();

  // ── Derived data ───────────────────────────────────────────────
  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "examNumber":
          cmp = a.examNumber.localeCompare(b.examNumber);
          break;
        case "status":
          cmp = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
          if (cmp === 0) cmp = b.session.examDate.localeCompare(a.session.examDate);
          break;
        case "absenceCategory":
          cmp = (a.absenceCategory ?? "").localeCompare(b.absenceCategory ?? "");
          break;
        case "examDate":
          cmp = a.session.examDate.localeCompare(b.session.examDate);
          break;
        case "submittedAt":
          cmp = (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "");
          break;
        case "attendCountsAsAttendance":
          cmp = Number(b.attendCountsAsAttendance) - Number(a.attendCountsAsAttendance);
          break;
        case "attendGrantsPerfectAttendance":
          cmp = Number(b.attendGrantsPerfectAttendance) - Number(a.attendGrantsPerfectAttendance);
          break;
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [notes, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sortedNotes.length / PAGE_SIZE));
  const paginatedNotes = sortedNotes.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  // Only PENDING notes are selectable (not already approved/rejected approved ones)
  const paginatedSelectableIds = paginatedNotes
    .filter((note) => note.status === AbsenceStatus.PENDING)
    .map((note) => note.id);

  const allSelectableSelected =
    paginatedSelectableIds.length > 0 &&
    paginatedSelectableIds.every((id) => selectedIds.includes(id));

  const pendingCount = notes.filter((n) => n.status === AbsenceStatus.PENDING).length;
  const rejectedCount = notes.filter((n) => n.status === AbsenceStatus.REJECTED).length;

  // ── Actions ────────────────────────────────────────────────────

  function toggleSort(column: SortColumn) {
    if (sortBy === column) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
    setCurrentPage(1);
    setSelectedIds([]);
  }

  function toggleRow(id: number, checked: boolean) {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((x) => x !== id),
    );
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? paginatedSelectableIds : []);
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const payload = await response.json() as { error?: string; succeeded?: number; failed?: number };
    if (!response.ok) throw new Error(payload.error ?? "요청에 실패했습니다.");
    return payload;
  }

  function reloadPage(message: string, title = "작업 완료") {
    completionModal.openModal({
      badgeLabel: "완료",
      badgeTone: "success",
      title,
      description: message,
      confirmLabel: "확인",
      onClose: () => window.location.reload(),
    });
  }

  function bulkReview(action: "approve" | "reject") {
    const label = action === "approve" ? "승인" : "반려";
    confirmModal.openModal({
      badgeLabel: `${label} 일괄`,
      badgeTone: "warning",
      title: `선택한 사유서를 ${label}할까요?`,
      description: `선택한 ${selectedIds.length}건을 ${label} 처리합니다.`,
      cancelLabel: "취소",
      confirmLabel: label,
      onConfirm: () => {
        confirmModal.closeModal();
        startTransition(async () => {
          try {
            const result = await requestJson("/api/absence-notes/bulk", {
              method: "POST",
              body: JSON.stringify({ action, ids: selectedIds }),
            });
            const successMsg = `${result.succeeded ?? 0}건 ${label} 완료${(result.failed ?? 0) > 0 ? `, ${result.failed}건 실패` : ""}`;
            toast.success(successMsg);
            reloadPage(successMsg, `일괄 ${label} 완료`);
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : `${label} 처리에 실패했습니다.`;
            toast.error(errMsg);
            // Show error in completion modal
            completionModal.openModal({
              badgeLabel: "오류",
              badgeTone: "warning",
              title: `${label} 처리 실패`,
              description: errMsg,
              confirmLabel: "확인",
            });
          }
        });
      },
    });
  }

  // ── Render ─────────────────────────────────────────────────────

  if (notes.length === 0) {
    return (
      <div className="mt-6 rounded-[28px] border border-dashed border-ink/10 p-8 text-center text-sm text-slate">
        조회된 사유서가 없습니다. 위 필터에서 조건을 변경하거나 사유서를 등록하세요.
      </div>
    );
  }

  return (
    <>
      {/* ── Status badges ── */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {pendingCount > 0 && (
          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            대기 {pendingCount}건
          </span>
        )}
        {rejectedCount > 0 && (
          <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
            반려 {rejectedCount}건
          </span>
        )}
        <span className="inline-flex rounded-full border border-ink/10 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate">
          전체 {notes.length}건
        </span>
      </div>

      {/* ── Table ── */}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10">
        <table className="w-full text-sm">
          <caption className="sr-only">
            사유서 목록 — 대기 항목을 선택해 일괄 승인 또는 반려 처리할 수 있습니다.
          </caption>
          <thead>
            <tr className="border-b border-ink/10 bg-mist/60 text-left text-xs font-semibold text-slate">
              {/* Select-all checkbox — only selects PENDING rows */}
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer"
                  aria-label="이 페이지의 대기 사유서 전체 선택"
                  checked={allSelectableSelected}
                  disabled={paginatedSelectableIds.length === 0}
                  onChange={(e) => toggleSelectAll(e.target.checked)}
                  title="대기 항목 전체 선택"
                />
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 hover:text-ink"
                onClick={() => toggleSort("examNumber")}
              >
                수험번호 · 이름{" "}
                <SortIcon column="examNumber" sortBy={sortBy} sortOrder={sortOrder} />
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 hover:text-ink"
                onClick={() => toggleSort("status")}
              >
                상태 <SortIcon column="status" sortBy={sortBy} sortOrder={sortOrder} />
              </th>
              <th className="px-4 py-3">학생 상태</th>
              <th
                className="cursor-pointer select-none px-4 py-3 hover:text-ink"
                onClick={() => toggleSort("absenceCategory")}
              >
                사유 유형{" "}
                <SortIcon column="absenceCategory" sortBy={sortBy} sortOrder={sortOrder} />
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 hover:text-ink"
                onClick={() => toggleSort("attendCountsAsAttendance")}
              >
                출석포함{" "}
                <SortIcon
                  column="attendCountsAsAttendance"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                />
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 hover:text-ink"
                onClick={() => toggleSort("attendGrantsPerfectAttendance")}
              >
                개근인정{" "}
                <SortIcon
                  column="attendGrantsPerfectAttendance"
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                />
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 hover:text-ink"
                onClick={() => toggleSort("examDate")}
              >
                회차 정보{" "}
                <SortIcon column="examDate" sortBy={sortBy} sortOrder={sortOrder} />
              </th>
              <th
                className="cursor-pointer select-none px-4 py-3 hover:text-ink"
                onClick={() => toggleSort("submittedAt")}
              >
                제출일{" "}
                <SortIcon column="submittedAt" sortBy={sortBy} sortOrder={sortOrder} />
              </th>
              <th className="px-4 py-3">상세</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {paginatedNotes.map((note) => {
              // Only PENDING notes get checkboxes
              const isSelectable = note.status === AbsenceStatus.PENDING;
              const isSelected = selectedIds.includes(note.id);

              return (
                <tr
                  key={note.id}
                  className={`transition-colors hover:bg-mist/40 ${isSelected ? "bg-amber-50/40" : ""}`}
                >
                  {/* Checkbox cell */}
                  <td className="px-4 py-3">
                    {isSelectable ? (
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
                      onClick={(e) => e.stopPropagation()}
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

                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[note.student.currentStatus]}`}
                    >
                      {STATUS_LABEL[note.student.currentStatus]}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-slate">
                    {note.absenceCategory
                      ? ABSENCE_CATEGORY_LABEL[note.absenceCategory]
                      : "-"}
                  </td>

                  <td className="px-4 py-3 text-center">
                    {note.attendCountsAsAttendance ? (
                      <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
                        포함
                      </span>
                    ) : (
                      <span className="text-slate">-</span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-center">
                    {note.attendGrantsPerfectAttendance ? (
                      <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">
                        인정
                      </span>
                    ) : (
                      <span className="text-slate">-</span>
                    )}
                  </td>

                  <td className="whitespace-nowrap px-4 py-3 text-slate">
                    {note.session.period.name} · {formatDate(note.session.examDate)} ·{" "}
                    {note.session.week}주차 · {SUBJECT_LABEL[note.session.subject]}
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

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate">
            {(currentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(currentPage * PAGE_SIZE, sortedNotes.length)} / {sortedNotes.length}건
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setCurrentPage(1);
                setSelectedIds([]);
              }}
              disabled={currentPage === 1}
              className="rounded-lg px-2 py-1 text-slate transition hover:bg-mist disabled:opacity-30"
            >
              «
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentPage((p) => Math.max(1, p - 1));
                setSelectedIds([]);
              }}
              disabled={currentPage === 1}
              className="rounded-lg px-2 py-1 text-slate transition hover:bg-mist disabled:opacity-30"
            >
              ‹
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
              const page = start + i;
              return (
                <button
                  key={page}
                  type="button"
                  onClick={() => {
                    setCurrentPage(page);
                    setSelectedIds([]);
                  }}
                  className={`min-w-[2rem] rounded-lg px-2 py-1 transition ${
                    page === currentPage
                      ? "bg-ink font-semibold text-white"
                      : "text-slate hover:bg-mist"
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setCurrentPage((p) => Math.min(totalPages, p + 1));
                setSelectedIds([]);
              }}
              disabled={currentPage === totalPages}
              className="rounded-lg px-2 py-1 text-slate transition hover:bg-mist disabled:opacity-30"
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentPage(totalPages);
                setSelectedIds([]);
              }}
              disabled={currentPage === totalPages}
              className="rounded-lg px-2 py-1 text-slate transition hover:bg-mist disabled:opacity-30"
            >
              »
            </button>
          </div>
        </div>
      )}

      {/* ── Fixed bottom bulk-action bar ── */}
      {selectedIds.length > 0 && <div className="h-24" />}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-ink/10 bg-white/95 px-4 py-3 shadow-lg backdrop-blur lg:left-[260px] sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold text-ink">
              {selectedIds.length}건 선택됨
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => bulkReview("approve")}
                disabled={isPending}
                className="inline-flex items-center rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest/80 disabled:opacity-50"
              >
                일괄 승인
              </button>
              <button
                type="button"
                onClick={() => bulkReview("reject")}
                disabled={isPending}
                className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
              >
                일괄 반려
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={isPending}
                className="inline-flex items-center rounded-full border border-ink/10 bg-white px-4 py-2 text-sm font-semibold text-slate transition hover:bg-mist disabled:opacity-50"
              >
                선택 해제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      <ActionModal
        open={Boolean(confirmModal.modal)}
        badgeLabel={confirmModal.modal?.badgeLabel ?? ""}
        badgeTone={confirmModal.modal?.badgeTone}
        title={confirmModal.modal?.title ?? ""}
        description={confirmModal.modal?.description ?? ""}
        details={confirmModal.modal?.details ?? []}
        cancelLabel={confirmModal.modal?.cancelLabel}
        confirmLabel={confirmModal.modal?.confirmLabel ?? "확인"}
        confirmTone={confirmModal.modal?.confirmTone}
        isPending={isPending}
        onClose={confirmModal.closeModal}
        onConfirm={confirmModal.modal?.onConfirm}
      />
      <ActionModal
        open={Boolean(completionModal.modal)}
        badgeLabel={completionModal.modal?.badgeLabel ?? ""}
        badgeTone={completionModal.modal?.badgeTone}
        title={completionModal.modal?.title ?? ""}
        description={completionModal.modal?.description ?? ""}
        details={completionModal.modal?.details ?? []}
        confirmLabel={completionModal.modal?.confirmLabel ?? "확인"}
        onClose={completionModal.closeModal}
        onConfirm={completionModal.modal?.onConfirm}
      />
    </>
  );
}
