"use client";

import Link from "next/link";
import {
  AdminMemoColor,
  AdminMemoScope,
  AdminMemoStatus,
  AdminRole,
} from "@prisma/client";
import { ActionModal } from "@/components/ui/action-modal";
import { useSubmitShortcut } from "@/hooks/use-submit-shortcut";
import {
  ADMIN_MEMO_COLOR_LABEL,
  ADMIN_MEMO_SCOPE_LABEL,
  ADMIN_MEMO_STATUS_LABEL,
  ROLE_LABEL,
} from "@/lib/constants";
import { fetchJson } from "@/lib/client/fetch-json";
import { formatDate, formatDateTime, toDateInputValue } from "@/lib/format";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

type AdminOption = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
};

type MemoRecord = {
  id: number;
  title: string;
  content: string | null;
  color: AdminMemoColor;
  scope: AdminMemoScope;
  status: AdminMemoStatus;
  isPinned: boolean;
  dueAt: string | null;
  relatedStudentExamNumber: string | null;
  createdAt: string;
  updatedAt: string;
  owner: AdminOption;
  assignee: AdminOption | null;
};

type FormState = {
  title: string;
  content: string;
  color: AdminMemoColor;
  scope: AdminMemoScope;
  status: AdminMemoStatus;
  isPinned: boolean;
  dueAt: string;
  assigneeId: string;
  relatedStudentExamNumber: string;
};

type AdminMemoBoardProps = {
  currentAdminId: string;
  currentAdminRole: AdminRole;
  initialMemos: MemoRecord[];
  adminOptions: AdminOption[];
};

type VisibilityFilter = "ALL" | "MINE" | "TEAM";
type StatusFilter = "ALL" | "OVERDUE" | AdminMemoStatus;

const STATUS_COLUMNS: AdminMemoStatus[] = [
  AdminMemoStatus.OPEN,
  AdminMemoStatus.IN_PROGRESS,
  AdminMemoStatus.DONE,
];

const COLOR_STYLES: Record<AdminMemoColor, string> = {
  SAND: "border-[#E7D3A8] bg-[#FFF8E7]",
  MINT: "border-[#BFE2D0] bg-[#F1FFF7]",
  SKY: "border-[#BFD8F5] bg-[#F4FAFF]",
  ROSE: "border-[#EDC2CC] bg-[#FFF5F7]",
  SLATE: "border-[#CBD5E1] bg-[#F8FAFC]",
};

const EMPTY_FORM: FormState = {
  title: "",
  content: "",
  color: AdminMemoColor.SAND,
  scope: AdminMemoScope.PRIVATE,
  status: AdminMemoStatus.OPEN,
  isPinned: false,
  dueAt: "",
  assigneeId: "",
  relatedStudentExamNumber: "",
};

function LoadingSpinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
    />
  );
}

function SuccessCheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="check-animated h-3.5 w-3.5"
    >
      <path
        d="M5 10.5 8.5 14 15 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function sortMemos(memos: MemoRecord[]) {
  const rank = {
    [AdminMemoStatus.OPEN]: 0,
    [AdminMemoStatus.IN_PROGRESS]: 1,
    [AdminMemoStatus.DONE]: 2,
  };

  return [...memos].sort((left, right) => {
    if (left.isPinned !== right.isPinned) {
      return Number(right.isPinned) - Number(left.isPinned);
    }

    if (rank[left.status] !== rank[right.status]) {
      return rank[left.status] - rank[right.status];
    }

    const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.POSITIVE_INFINITY;

    if (leftDue !== rightDue) {
      return leftDue - rightDue;
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function isOverdue(memo: MemoRecord) {
  return memo.status !== AdminMemoStatus.DONE && !!memo.dueAt && new Date(memo.dueAt).getTime() < Date.now();
}

function canEditMemo(memo: MemoRecord, currentAdminId: string, currentAdminRole: AdminRole) {
  if (currentAdminRole === AdminRole.SUPER_ADMIN) {
    return true;
  }

  if (memo.scope === AdminMemoScope.TEAM) {
    return true;
  }

  return memo.owner.id === currentAdminId || memo.assignee?.id === currentAdminId;
}

function canDeleteMemo(memo: MemoRecord, currentAdminId: string, currentAdminRole: AdminRole) {
  return currentAdminRole === AdminRole.SUPER_ADMIN || memo.owner.id === currentAdminId;
}

function buildFormState(memo: MemoRecord): FormState {
  return {
    title: memo.title,
    content: memo.content ?? "",
    color: memo.color,
    scope: memo.scope,
    status: memo.status,
    isPinned: memo.isPinned,
    dueAt: toDateInputValue(memo.dueAt),
    assigneeId: memo.assignee?.id ?? "",
    relatedStudentExamNumber: memo.relatedStudentExamNumber ?? "",
  };
}

function buildSaveDraftKey(editingId: number | null, form: FormState) {
  return JSON.stringify({
    editingId,
    ...form,
  });
}

function nextStatus(status: AdminMemoStatus) {
  switch (status) {
    case AdminMemoStatus.OPEN:
      return AdminMemoStatus.IN_PROGRESS;
    case AdminMemoStatus.IN_PROGRESS:
      return AdminMemoStatus.DONE;
    case AdminMemoStatus.DONE:
      return AdminMemoStatus.OPEN;
    default:
      return AdminMemoStatus.OPEN;
  }
}

function nextStatusLabel(status: AdminMemoStatus) {
  switch (status) {
    case AdminMemoStatus.OPEN:
      return "진행 시작";
    case AdminMemoStatus.IN_PROGRESS:
      return "완료 처리";
    case AdminMemoStatus.DONE:
      return "다시 열기";
    default:
      return "상태 변경";
  }
}

export function AdminMemoBoard({
  currentAdminId,
  currentAdminRole,
  initialMemos,
  adminOptions,
}: AdminMemoBoardProps) {
  const [memos, setMemos] = useState(() => sortMemos(initialMemos));
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [deleteTarget, setDeleteTarget] = useState<MemoRecord | null>(null);
  const [isPending, startTransition] = useTransition();
  const [saveButtonState, setSaveButtonState] = useState<"idle" | "loading" | "success">("idle");
  const [savedDraftKey, setSavedDraftKey] = useState<string | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const currentDraftKey = useMemo(() => buildSaveDraftKey(editingId, form), [editingId, form]);
  const showSaveSuccess = saveButtonState === "success" && savedDraftKey === currentDraftKey;

  useEffect(() => {
    if (saveButtonState !== "success") {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSaveButtonState("idle");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [saveButtonState]);

  const filteredMemos = memos.filter((memo) => {
    const normalizedSearch = search.trim().toLowerCase();
    const searchTarget = [
      memo.title,
      memo.content ?? "",
      memo.owner.name,
      memo.assignee?.name ?? "",
      memo.relatedStudentExamNumber ?? "",
    ]
      .join(" ")
      .toLowerCase();

    if (visibilityFilter === "MINE") {
      const mine = memo.owner.id === currentAdminId || memo.assignee?.id === currentAdminId;
      if (!mine) {
        return false;
      }
    }

    if (visibilityFilter === "TEAM" && memo.scope !== AdminMemoScope.TEAM) {
      return false;
    }

    if (statusFilter === "OVERDUE" && !isOverdue(memo)) {
      return false;
    }

    if (statusFilter !== "ALL" && statusFilter !== "OVERDUE" && memo.status !== statusFilter) {
      return false;
    }

    return !normalizedSearch || searchTarget.includes(normalizedSearch);
  });

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setSaveButtonState("idle");
    setSavedDraftKey(null);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveButtonState("idle");
    setSavedDraftKey(null);
  }

  function upsertMemo(nextMemo: MemoRecord) {
    setMemos((current) => sortMemos([...current.filter((memo) => memo.id !== nextMemo.id), nextMemo]));
  }

  function saveMemo() {
    setNoticeMessage(null);
    setErrorMessage(null);
    setSaveButtonState("loading");
    setSavedDraftKey(null);

    startTransition(async () => {
      try {
        const payload = {
          title: form.title,
          content: form.content,
          color: form.color,
          scope: form.scope,
          status: form.status,
          isPinned: form.isPinned,
          dueAt: form.dueAt || null,
          assigneeId: form.assigneeId || null,
          relatedStudentExamNumber: form.relatedStudentExamNumber || null,
        };
        const result = editingId
          ? await fetchJson<{ memo: MemoRecord }>(`/api/admin-memos/${editingId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetchJson<{ memo: MemoRecord }>("/api/admin-memos", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

        upsertMemo(result.memo);
        setNoticeMessage(editingId ? "운영 메모를 수정했습니다." : "운영 메모를 등록했습니다.");
        resetForm();
        setSavedDraftKey(buildSaveDraftKey(null, EMPTY_FORM));
        setSaveButtonState("success");
      } catch (error) {
        setSaveButtonState("idle");
        setSavedDraftKey(null);
        setErrorMessage(error instanceof Error ? error.message : "운영 메모를 저장하지 못했습니다.");
      }
    });
  }

  function patchMemo(memo: MemoRecord, patch: Record<string, unknown>, successMessage: string) {
    setNoticeMessage(null);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const result = await fetchJson<{ memo: MemoRecord }>(`/api/admin-memos/${memo.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });

        upsertMemo(result.memo);
        setNoticeMessage(successMessage);

        if (editingId === memo.id) {
          setForm(buildFormState(result.memo));
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "운영 메모를 수정하지 못했습니다.");
      }
    });
  }

  function deleteMemo() {
    if (!deleteTarget) {
      return;
    }

    setNoticeMessage(null);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        await fetchJson(`/api/admin-memos/${deleteTarget.id}`, { method: "DELETE" });
        setMemos((current) => current.filter((memo) => memo.id !== deleteTarget.id));
        setNoticeMessage("운영 메모를 삭제했습니다.");

        if (editingId === deleteTarget.id) {
          resetForm();
        }

        setDeleteTarget(null);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "운영 메모를 삭제하지 못했습니다.");
      }
    });
  }

  useSubmitShortcut({
    containerRef: composerRef,
    enabled: !isPending,
    onSubmit: saveMemo,
  });

  const openCount = memos.filter((memo) => memo.status !== AdminMemoStatus.DONE).length;
  const overdueCount = memos.filter(isOverdue).length;
  const teamCount = memos.filter((memo) => memo.scope === AdminMemoScope.TEAM).length;
  const pinnedCount = memos.filter((memo) => memo.isPinned).length;

  return (
    <div className="space-y-8">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <div ref={composerRef} className="rounded-[28px] border border-ink/10 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-forest">
                Admin Memo Desk
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-ink">
                {editingId ? "메모 수정" : "새 운영 메모"}
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate">
                학생 공지와 분리된 내부용 메모입니다. 공용 메모로 공유하고 상태와 마감일로 업무를 관리하세요.
              </p>
            </div>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="btn-ripple inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30"
              >
                새 메모로 전환
              </button>
            ) : null}
          </div>

          {noticeMessage ? <div className="mt-6 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">{noticeMessage}</div> : null}
          {errorMessage ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div> : null}

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-ink">제목</label>
              <input value={form.title} onChange={(event) => setField("title", event.target.value)} className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm" placeholder="예: 3월 월간 성적 공지 초안 확인" />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-ink">메모 내용</label>
              <textarea value={form.content} onChange={(event) => setField("content", event.target.value)} rows={6} className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm leading-7" placeholder="업무 배경, 다음 행동, 체크해야 할 위험 요소를 적어 두세요." />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">담당자</label>
                <select value={form.assigneeId} onChange={(event) => setField("assigneeId", event.target.value)} className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm">
                  <option value="">미지정</option>
                  {adminOptions.map((admin) => (
                    <option key={admin.id} value={admin.id}>
                      {admin.name} · {ROLE_LABEL[admin.role]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">마감일</label>
                <input type="date" value={form.dueAt} onChange={(event) => setField("dueAt", event.target.value)} className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">메모 범위</label>
                <select value={form.scope} onChange={(event) => setField("scope", event.target.value as AdminMemoScope)} className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm">
                  {Object.values(AdminMemoScope).map((scope) => (
                    <option key={scope} value={scope}>{ADMIN_MEMO_SCOPE_LABEL[scope]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">진행 상태</label>
                <select value={form.status} onChange={(event) => setField("status", event.target.value as AdminMemoStatus)} className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm">
                  {STATUS_COLUMNS.map((status) => (
                    <option key={status} value={status}>{ADMIN_MEMO_STATUS_LABEL[status]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-ink">관련 수험번호</label>
                <input value={form.relatedStudentExamNumber} onChange={(event) => setField("relatedStudentExamNumber", event.target.value)} className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm" placeholder="선택 입력" />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {Object.values(AdminMemoColor).map((color) => (
                <button key={color} type="button" onClick={() => setField("color", color)} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${form.color === color ? `${COLOR_STYLES[color]} text-ink` : "border-ink/10 bg-white text-slate hover:border-ink/30"}`}>
                  {ADMIN_MEMO_COLOR_LABEL[color]}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-4 py-3 text-sm font-medium text-ink">
              <input type="checkbox" checked={form.isPinned} onChange={(event) => setField("isPinned", event.target.checked)} />
              상단 고정 메모로 표시
            </label>

            <div className="flex flex-wrap gap-3 pt-2">
              <button type="button" onClick={saveMemo} disabled={isPending} className={`btn-ripple btn-success inline-flex items-center gap-1.5 rounded-full px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${showSaveSuccess ? "bg-forest" : "bg-ink hover:bg-forest"}`}>
                {saveButtonState === "loading" ? <LoadingSpinner /> : null}
                {showSaveSuccess ? <SuccessCheckIcon /> : null}
                <span>{saveButtonState === "loading" ? "저장 중..." : showSaveSuccess ? "저장됨" : editingId ? "메모 저장" : "메모 등록"}</span>
              </button>
              <button type="button" onClick={resetForm} disabled={isPending} className="btn-ripple inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold text-ink transition hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-60">
                입력 초기화
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[24px] border border-forest/20 bg-forest/10 p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-forest">Open</p><p className="mt-3 text-3xl font-semibold text-ink">{openCount}</p><p className="mt-2 text-sm text-slate">완료되지 않은 메모</p></div>
            <div className="rounded-[24px] border border-red-200 bg-red-50 p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-700">Due</p><p className="mt-3 text-3xl font-semibold text-ink">{overdueCount}</p><p className="mt-2 text-sm text-slate">마감이 지난 메모</p></div>
            <div className="rounded-[24px] border border-ink/10 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Shared</p><p className="mt-3 text-3xl font-semibold text-ink">{teamCount}</p><p className="mt-2 text-sm text-slate">공용 메모</p></div>
            <div className="rounded-[24px] border border-ink/10 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate">Pinned</p><p className="mt-3 text-3xl font-semibold text-ink">{pinnedCount}</p><p className="mt-2 text-sm text-slate">상단 고정 메모</p></div>
          </div>

          <div className="rounded-[28px] border border-ink/10 bg-white p-5">
            <h3 className="text-lg font-semibold text-ink">메모 필터</h3>
            <div className="mt-4 space-y-4">
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm" placeholder="제목, 내용, 담당자, 수험번호 검색" />
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "ALL", label: "전체" },
                  { key: "MINE", label: "내 메모" },
                  { key: "TEAM", label: "공용 메모" },
                ].map((item) => (
                  <button key={item.key} type="button" onClick={() => setVisibilityFilter(item.key as VisibilityFilter)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${visibilityFilter === item.key ? "bg-ink text-white" : "border border-ink/10 bg-white text-slate hover:border-ink/30"}`}>
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {[{ key: "ALL", label: "전체 상태" }, { key: "OVERDUE", label: "지연" }, ...STATUS_COLUMNS.map((status) => ({ key: status, label: ADMIN_MEMO_STATUS_LABEL[status] }))].map((item) => (
                  <button key={item.key} type="button" onClick={() => setStatusFilter(item.key as StatusFilter)} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${statusFilter === item.key ? "bg-forest text-white" : "border border-ink/10 bg-white text-slate hover:border-ink/30"}`}>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-ink">업무 메모 보드</h2>
            <p className="mt-2 text-sm text-slate">포스트잇처럼 빠르게 남기되, 실제 업무는 상태와 담당자로 정리합니다.</p>
          </div>
          <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">필터 결과 {filteredMemos.length}개</span>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {STATUS_COLUMNS.map((status) => {
            const columnMemos = filteredMemos.filter((memo) => memo.status === status);

            return (
              <section key={status} className="rounded-[24px] border border-ink/10 bg-mist/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate">{ADMIN_MEMO_STATUS_LABEL[status]}</h3>
                  <span className="rounded-full border border-ink/10 bg-white px-3 py-1 text-xs font-semibold text-slate">{columnMemos.length}</span>
                </div>

                <div className="mt-4 space-y-4">
                  {columnMemos.length === 0 ? <div className="rounded-[20px] border border-dashed border-ink/10 bg-white/70 px-4 py-8 text-center text-sm text-slate">이 상태의 메모가 없습니다.</div> : null}

                  {columnMemos.map((memo) => {
                    const editable = canEditMemo(memo, currentAdminId, currentAdminRole);
                    const deletable = canDeleteMemo(memo, currentAdminId, currentAdminRole);

                    return (
                      <article key={memo.id} className={`rounded-[24px] border p-5 shadow-sm ${COLOR_STYLES[memo.color]}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap gap-2">
                              <span className="inline-flex rounded-full border border-ink/10 bg-white/80 px-3 py-1 text-xs font-semibold text-slate">{ADMIN_MEMO_SCOPE_LABEL[memo.scope]}</span>
                              {memo.isPinned ? <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">고정</span> : null}
                              {isOverdue(memo) ? <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">마감 지연</span> : null}
                            </div>
                            <h4 className="mt-3 text-lg font-semibold text-ink">{memo.title}</h4>
                          </div>
                          <button type="button" onClick={() => patchMemo(memo, { isPinned: !memo.isPinned }, memo.isPinned ? "메모 고정을 해제했습니다." : "메모를 상단에 고정했습니다.")} disabled={isPending || !editable} className="rounded-full border border-ink/10 bg-white/80 px-3 py-1 text-xs font-semibold text-slate transition hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-50">{memo.isPinned ? "해제" : "고정"}</button>
                        </div>

                        {memo.content ? <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-ink">{memo.content}</p> : <p className="mt-4 text-sm text-slate">메모 본문 없음</p>}

                        <div className="mt-4 space-y-2 text-xs text-slate">
                          <p>작성 {memo.owner.name}{memo.assignee ? ` · 담당 ${memo.assignee.name}` : " · 담당 미지정"}</p>
                          <p>생성 {formatDateTime(memo.createdAt)} · 수정 {formatDateTime(memo.updatedAt)}</p>
                          <p>{memo.dueAt ? `마감 ${formatDate(memo.dueAt)}` : "마감일 없음"}</p>
                          {memo.relatedStudentExamNumber ? <p>관련 학생 <Link href={`/admin/students/${encodeURIComponent(memo.relatedStudentExamNumber)}`} className="font-semibold text-forest underline">{memo.relatedStudentExamNumber}</Link></p> : null}
                        </div>

                        <div className="mt-5 flex flex-wrap gap-2">
                          <button type="button" onClick={() => { setSaveButtonState("idle"); setSavedDraftKey(null); setEditingId(memo.id); setForm(buildFormState(memo)); }} disabled={isPending || !editable} className="btn-ripple inline-flex items-center rounded-full border border-ink/10 bg-white/80 px-4 py-2 text-sm font-semibold text-ink transition hover:border-ink/30 disabled:cursor-not-allowed disabled:opacity-50">편집</button>
                          <button type="button" onClick={() => patchMemo(memo, { status: nextStatus(memo.status), isPinned: memo.status === AdminMemoStatus.IN_PROGRESS ? false : memo.isPinned }, `${nextStatusLabel(memo.status)} 상태로 변경했습니다.`)} disabled={isPending || !editable} className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:opacity-50">{nextStatusLabel(memo.status)}</button>
                          {deletable ? <button type="button" onClick={() => setDeleteTarget(memo)} disabled={isPending} className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50">삭제</button> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      <ActionModal
        open={deleteTarget !== null}
        badgeLabel="메모 삭제"
        badgeTone="warning"
        title="운영 메모를 삭제할까요?"
        description="삭제 후에는 복구되지 않습니다. 공용 메모라면 다른 관리자 화면에서도 즉시 사라집니다."
        details={deleteTarget ? [`제목: ${deleteTarget.title}`, `범위: ${ADMIN_MEMO_SCOPE_LABEL[deleteTarget.scope]}`, `작성자: ${deleteTarget.owner.name}`] : []}
        cancelLabel="취소"
        confirmLabel="삭제"
        confirmTone="danger"
        isPending={isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteMemo}
      />
    </div>
  );
}

