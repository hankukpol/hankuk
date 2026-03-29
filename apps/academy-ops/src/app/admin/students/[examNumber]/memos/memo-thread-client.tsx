"use client";

import { useState } from "react";
import { AdminMemoColor, AdminMemoScope, AdminMemoStatus } from "@prisma/client";
import { toast } from "sonner";

export type MemoRow = {
  id: number;
  title: string;
  content: string | null;
  color: AdminMemoColor;
  scope: AdminMemoScope;
  status: AdminMemoStatus;
  isPinned: boolean;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; name: string };
  assignee: { id: string; name: string } | null;
};

const MEMO_COLOR_BG: Record<AdminMemoColor, string> = {
  SAND: "bg-amber-50 border-amber-200",
  MINT: "bg-teal-50 border-teal-200",
  SKY: "bg-sky-50 border-sky-200",
  ROSE: "bg-rose-50 border-rose-200",
  SLATE: "bg-slate-50 border-slate-200",
};

const MEMO_COLOR_DOT: Record<AdminMemoColor, string> = {
  SAND: "bg-amber-400",
  MINT: "bg-teal-400",
  SKY: "bg-sky-400",
  ROSE: "bg-rose-400",
  SLATE: "bg-slate-400",
};

const MEMO_COLOR_LABEL: Record<AdminMemoColor, string> = {
  SAND: "샌드",
  MINT: "민트",
  SKY: "스카이",
  ROSE: "로즈",
  SLATE: "슬레이트",
};

const MEMO_STATUS_LABEL: Record<AdminMemoStatus, string> = {
  OPEN: "할 일",
  IN_PROGRESS: "진행 중",
  DONE: "완료",
};

const MEMO_STATUS_COLOR: Record<AdminMemoStatus, string> = {
  OPEN: "border-amber-200 bg-amber-50 text-amber-700",
  IN_PROGRESS: "border-blue-200 bg-blue-50 text-blue-700",
  DONE: "border-ink/20 bg-mist text-slate",
};

const MEMO_SCOPE_LABEL: Record<AdminMemoScope, string> = {
  PRIVATE: "개인",
  TEAM: "공용",
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${mo}.${day}`;
}

type QuickCreateFormProps = {
  examNumber: string;
  onAdded: (memo: MemoRow) => void;
};

export function QuickCreateForm({ examNumber, onAdded }: QuickCreateFormProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [color, setColor] = useState<AdminMemoColor>("SAND");
  const [scope, setScope] = useState<AdminMemoScope>("PRIVATE");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("메모 제목을 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/students/${examNumber}/memos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim() || null,
          color,
          scope,
          dueAt: dueAt || null,
          relatedStudentExamNumber: examNumber,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "메모 저장에 실패했습니다.");
      }
      const body = await res.json() as { data: MemoRow };
      onAdded(body.data);
      setTitle("");
      setContent("");
      setColor("SAND");
      setScope("PRIVATE");
      setDueAt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "메모 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[24px] border border-ember/20 bg-white p-6 shadow-sm"
    >
      <h3 className="mb-4 text-base font-semibold text-ink">새 메모 작성</h3>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate">
            제목 <span className="text-ember">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="메모 제목을 입력하세요"
            className="w-full rounded-2xl border border-ink/10 bg-mist/40 px-4 py-3 text-sm focus:border-ember/30 focus:outline-none focus:ring-2 focus:ring-ember/10"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate">내용</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            placeholder="상세 내용을 입력하세요 (선택)"
            className="w-full rounded-2xl border border-ink/10 bg-mist/40 px-4 py-3 text-sm focus:border-ember/30 focus:outline-none focus:ring-2 focus:ring-ember/10"
          />
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate">색상</label>
            <select
              value={color}
              onChange={(e) => setColor(e.target.value as AdminMemoColor)}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {(Object.entries(MEMO_COLOR_LABEL) as [AdminMemoColor, string][]).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate">공개 범위</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as AdminMemoScope)}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              {(Object.entries(MEMO_SCOPE_LABEL) as [AdminMemoScope, string][]).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-xs font-semibold text-slate">마감일 (선택)</label>
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
        </div>
        {error && (
          <p className="rounded-2xl bg-rose-50 px-4 py-2 text-sm text-rose-600">{error}</p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-ember px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-60"
          >
            {saving ? "저장 중..." : "메모 저장"}
          </button>
        </div>
      </div>
    </form>
  );
}

type MemoThreadClientProps = {
  examNumber: string;
  initialMemos: MemoRow[];
  currentAdminId: string;
};

type StatusFilter = AdminMemoStatus | "ALL";

export function MemoThreadClient({
  examNumber,
  initialMemos,
  currentAdminId,
}: MemoThreadClientProps) {
  const [memos, setMemos] = useState<MemoRow[]>(initialMemos);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function handleAdded(memo: MemoRow) {
    setMemos((prev) => [memo, ...prev]);
    setShowForm(false);
  }

  async function handleDelete(memoId: number) {
    if (!confirm("메모를 삭제하시겠습니까?")) return;
    setDeletingId(memoId);
    try {
      const res = await fetch(`/api/students/${examNumber}/memos/${memoId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        toast.error(body.error ?? "삭제에 실패했습니다.");
        return;
      }
      setMemos((prev) => prev.filter((m) => m.id !== memoId));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleStatusChange(memoId: number, newStatus: AdminMemoStatus) {
    const res = await fetch(`/api/students/${examNumber}/memos/${memoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) return;
    const body = await res.json() as { data: MemoRow };
    setMemos((prev) => prev.map((m) => (m.id === memoId ? body.data : m)));
  }

  const filteredMemos = statusFilter === "ALL"
    ? memos
    : memos.filter((m) => m.status === statusFilter);

  const openCount = memos.filter((m) => m.status === "OPEN").length;
  const inProgressCount = memos.filter((m) => m.status === "IN_PROGRESS").length;
  const doneCount = memos.filter((m) => m.status === "DONE").length;

  const statusFilters: Array<{ value: StatusFilter; label: string; count: number }> = [
    { value: "ALL", label: "전체", count: memos.length },
    { value: "OPEN", label: "할 일", count: openCount },
    { value: "IN_PROGRESS", label: "진행 중", count: inProgressCount },
    { value: "DONE", label: "완료", count: doneCount },
  ];

  return (
    <div className="space-y-6">
      {/* 상단 바 */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {statusFilters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                statusFilter === f.value
                  ? "bg-ink text-white"
                  : "border border-ink/10 bg-white text-slate hover:border-ink/30"
              }`}
            >
              {f.label}
              {f.count > 0 && (
                <span className={`ml-1 ${statusFilter === f.value ? "text-white/70" : "text-slate/60"}`}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
          >
            + 메모 추가
          </button>
        )}
      </div>

      {/* 작성 폼 */}
      {showForm && (
        <div>
          <QuickCreateForm examNumber={examNumber} onAdded={handleAdded} />
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-full border border-ink/10 px-4 py-2 text-sm text-slate transition hover:border-ink/30"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 메모 목록 */}
      {filteredMemos.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-ink/10 p-10 text-center text-sm text-slate">
          {statusFilter === "ALL"
            ? "이 학생에 대한 메모가 없습니다."
            : `${MEMO_STATUS_LABEL[statusFilter as AdminMemoStatus]} 상태의 메모가 없습니다.`}
          {statusFilter === "ALL" && !showForm && (
            <>
              <br />
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="mt-3 inline-flex items-center text-ember hover:underline"
              >
                첫 메모 작성하기
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredMemos.map((memo) => (
            <MemoCard
              key={memo.id}
              memo={memo}
              currentAdminId={currentAdminId}
              deletingId={deletingId}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type MemoCardProps = {
  memo: MemoRow;
  currentAdminId: string;
  deletingId: number | null;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: AdminMemoStatus) => void;
};

function MemoCard({ memo, currentAdminId, deletingId, onDelete, onStatusChange }: MemoCardProps) {
  const canDelete = memo.owner.id === currentAdminId;

  return (
    <div className={`relative rounded-[24px] border p-5 ${MEMO_COLOR_BG[memo.color]}`}>
      {memo.isPinned && (
        <span className="absolute right-4 top-4 text-xs text-slate" title="고정된 메모">
          📌
        </span>
      )}
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${MEMO_COLOR_DOT[memo.color]}`} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-snug text-ink">{memo.title}</p>
          {memo.content && (
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate">
              {memo.content}
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${MEMO_STATUS_COLOR[memo.status]}`}
        >
          {MEMO_STATUS_LABEL[memo.status]}
        </span>
        <span className="text-xs text-slate">{MEMO_SCOPE_LABEL[memo.scope]}</span>
        {memo.dueAt && (
          <span className="text-xs text-slate">마감: {fmtDate(memo.dueAt)}</span>
        )}
        <span className="ml-auto text-xs text-slate">
          {memo.owner.name} · {fmtDate(memo.createdAt)}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-black/5 pt-3">
        {memo.status !== "DONE" && (
          <button
            type="button"
            onClick={() =>
              onStatusChange(memo.id, memo.status === "OPEN" ? "IN_PROGRESS" : "DONE")
            }
            className="rounded-full border border-ink/10 bg-white/70 px-3 py-1 text-xs font-semibold text-slate transition hover:border-ink/30"
          >
            {memo.status === "OPEN" ? "→ 진행 중" : "→ 완료"}
          </button>
        )}
        {memo.status === "DONE" && (
          <button
            type="button"
            onClick={() => onStatusChange(memo.id, "OPEN")}
            className="rounded-full border border-ink/10 bg-white/70 px-3 py-1 text-xs font-semibold text-slate transition hover:border-ink/30"
          >
            다시 열기
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => onDelete(memo.id)}
            disabled={deletingId === memo.id}
            className="ml-auto rounded-full border border-red-200 bg-white/70 px-3 py-1 text-xs font-semibold text-red-500 transition hover:bg-red-50 disabled:opacity-60"
          >
            {deletingId === memo.id ? "삭제 중..." : "삭제"}
          </button>
        )}
      </div>
    </div>
  );
}
