"use client";

import { useId } from "react";
import { DialogActions } from "@/components/ui/DialogActions";

import { LoaderCircle, Pencil, Pin, Plus, RefreshCcw, Save, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/sonner";

import { SlideOver } from "@/components/ui/SlideOver";
import { useActionCompleteModal } from "@/components/ui/useActionCompleteModal";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import type { AnnouncementItem, AnnouncementScope } from "@/lib/services/announcement.service";

type AnnouncementManagerProps = {
  divisionSlug: string;
  initialAnnouncements: AnnouncementItem[];
  canManageGlobal: boolean;
};

type FormState = {
  title: string;
  content: string;
  isPinned: boolean;
  scope: AnnouncementScope;
  publishedAt: string;
};

type VisibilityFilter = "ALL" | "PUBLISHED" | "SCHEDULED" | "PINNED";

function toFormState(scope: AnnouncementScope): FormState {
  return {
    title: "",
    content: "",
    isPinned: false,
    scope,
    publishedAt: "",
  };
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR");
}

function formatBoardDate(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTimeLocal(value: string | null) {
  if (!value) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));

  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return `${pick("year")}-${pick("month")}-${pick("day")}T${pick("hour")}:${pick("minute")}`;
}

function getScopeLabel(scope: AnnouncementScope, divisionName?: string | null) {
  return scope === "GLOBAL" ? "전체 공지" : divisionName || "지점 공지";
}

function getVisibilityLabel(announcement: AnnouncementItem) {
  if (!announcement.isPublished && announcement.publishedAt) {
    return "예약 공지";
  }

  return "공개 중";
}

function getAnnouncementDate(announcement: AnnouncementItem) {
  return announcement.publishedAt ?? announcement.createdAt;
}

function getPreviewText(content: string, maxLength = 72) {
  const normalized = content.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}


export function AnnouncementBadges({ announcement }: { announcement: AnnouncementItem }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="admin-badge">{getVisibilityLabel(announcement)}</span>
      {announcement.isPinned ? <span className="admin-badge"><Pin className="h-4 w-4" aria-hidden="true" />상단 고정</span> : null}
    </div>
  );
}

export function AnnouncementManager({
  divisionSlug,
  initialAnnouncements,
  canManageGlobal,
}: AnnouncementManagerProps) {
  const dialogFormId = useId();
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(
    null,
  );
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [filterScope, setFilterScope] = useState<"ALL" | AnnouncementScope>("ALL");
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>("ALL");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [form, setForm] = useState<FormState>(toFormState("DIVISION"));
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { showActionComplete, actionCompleteModal } = useActionCompleteModal();
  const { confirm, confirmDialog } = useConfirmDialog();

  const visibleAnnouncements = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();

    return announcements
      .filter((announcement) => filterScope === "ALL" || announcement.scope === filterScope)
      .filter((announcement) => {
        switch (visibilityFilter) {
          case "PUBLISHED":
            return announcement.isPublished;
          case "SCHEDULED":
            return !announcement.isPublished && Boolean(announcement.publishedAt);
          case "PINNED":
            return announcement.isPinned;
          default:
            return true;
        }
      })
      .filter((announcement) => {
        if (!keyword) {
          return true;
        }

        return (
          announcement.title.toLowerCase().includes(keyword) ||
          announcement.content.toLowerCase().includes(keyword) ||
          (announcement.divisionName?.toLowerCase().includes(keyword) ?? false)
        );
      })
      .sort((left, right) => {
        const leftDate = left.publishedAt ?? left.createdAt;
        const rightDate = right.publishedAt ?? right.createdAt;
        return rightDate.localeCompare(leftDate);
      });
  }, [announcements, filterScope, searchKeyword, visibilityFilter]);

  const pinnedCount = announcements.filter((announcement) => announcement.isPinned).length;
  const scheduledCount = announcements.filter(
    (announcement) => !announcement.isPublished && announcement.publishedAt,
  ).length;
  const publishedCount = announcements.filter((announcement) => announcement.isPublished).length;
  const selectedAnnouncement =
    visibleAnnouncements.find((announcement) => announcement.id === selectedAnnouncementId) ?? null;

  useEffect(() => {
    if (selectedAnnouncementId && !visibleAnnouncements.some((item) => item.id === selectedAnnouncementId)) {
      setSelectedAnnouncementId(null);
    }
  }, [selectedAnnouncementId, visibleAnnouncements]);

  function canEditAnnouncement(announcement: AnnouncementItem) {
    return announcement.scope === "DIVISION" || canManageGlobal;
  }

  function resetForm() {
    setEditingAnnouncementId(null);
    setForm(toFormState("DIVISION"));
  }

  function closeEditor() {
    setIsEditorOpen(false);
    resetForm();
  }

  function openCreatePanel() {
    resetForm();
    setIsEditorOpen(true);
  }

  function startEdit(announcement: AnnouncementItem) {
    setSelectedAnnouncementId(announcement.id);
    setEditingAnnouncementId(announcement.id);
    setForm({
      title: announcement.title,
      content: announcement.content,
      isPinned: announcement.isPinned,
      scope: announcement.scope,
      publishedAt: formatDateTimeLocal(announcement.publishedAt),
    });
    setIsEditorOpen(true);
  }

  async function refreshAnnouncements(showToast = false) {
    setIsRefreshing(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/announcements`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "공지 목록을 불러오지 못했습니다.");
      }

      setAnnouncements(data.announcements);

      if (showToast) {
        toast.success("공지 목록을 새로고침했습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "공지 목록을 불러오지 못했습니다.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);

    try {
      const response = await fetch(
        editingAnnouncementId
          ? `/api/${divisionSlug}/announcements/${editingAnnouncementId}`
          : `/api/${divisionSlug}/announcements`,
        {
          method: editingAnnouncementId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            publishedAt: form.publishedAt || null,
          }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "공지 저장에 실패했습니다.");
      }

      toast.success(editingAnnouncementId ? "공지를 수정했습니다." : "공지를 등록했습니다.");
      await refreshAnnouncements();
      showActionComplete({
        title: editingAnnouncementId ? "공지 수정 완료" : "공지 등록 완료",
        description: editingAnnouncementId
          ? "공지 내용과 노출 설정이 수정되었습니다."
          : "새 공지가 등록되었습니다.",
        notice: "저장한 공지는 공지 목록과 학생/관리자 화면에 바로 반영됩니다.",
      });
      closeEditor();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "공지 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(announcement: AnnouncementItem) {
    const confirmed = await confirm({
      title: "공지 삭제",
      description: "이 공지를 삭제하시겠습니까?",
      confirmLabel: "삭제",
      variant: "danger",
    });

    if (!confirmed) {
      return;
    }

    setDeletingId(announcement.id);

    try {
      const response = await fetch(`/api/${divisionSlug}/announcements/${announcement.id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "공지 삭제에 실패했습니다.");
      }

      toast.success("공지를 삭제했습니다.");
      await refreshAnnouncements();
      showActionComplete({
        title: "공지 삭제 완료",
        description: "선택한 공지가 삭제되었습니다.",
        notice: "삭제한 공지는 목록과 공지 노출 화면에서 즉시 사라집니다.",
      });

      if (editingAnnouncementId === announcement.id) {
        closeEditor();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "공지 삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="admin-section">
        <div className="admin-workspace-toolbar">
          <dl className="flex flex-wrap gap-4" aria-label="공지 집계">
            {[
              ["전체", announcements.length], ["공개 중", publishedCount],
              ["예약", scheduledCount], ["상단 고정", pinnedCount],
            ].map(([label, count]) => (
              <div key={label} className="flex items-center gap-2">
                <dt className="admin-help">{label}</dt>
                <dd className="font-semibold tabular-nums">{count}건</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void refreshAnnouncements(true)} disabled={isRefreshing} className="admin-button">
              {isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} 새로고침
            </button>
            <button type="button" onClick={openCreatePanel} className="admin-button admin-button-primary">
              <Plus className="h-4 w-4" /> 공지 작성
            </button>
          </div>
        </div>
        <div className="admin-filter-bar">
          <label>
            <span className="admin-label mb-2 block">공지 검색</span>
            <span className="admin-input-group">
              <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              <input value={searchKeyword} onChange={(event) => setSearchKeyword(event.target.value)} className="w-full" placeholder="제목, 본문, 지점명" />
            </span>
          </label>
          <label>
            <span className="admin-label mb-2 block">공지 범위</span>
            <select value={filterScope} onChange={(event) => setFilterScope(event.target.value as "ALL" | AnnouncementScope)} className="w-full">
              <option value="ALL">전체 범위</option><option value="DIVISION">지점 공지</option><option value="GLOBAL">전체 공지</option>
            </select>
          </label>
          <label>
            <span className="admin-label mb-2 block">공개 상태</span>
            <select value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value as VisibilityFilter)} className="w-full">
              <option value="ALL">전체 상태</option><option value="PUBLISHED">공개 중</option><option value="SCHEDULED">예약 공지</option><option value="PINNED">상단 고정</option>
            </select>
          </label>
        </div>
        <h2 className="admin-section-title">공지 목록 <span className="text-admin-accent">{visibleAnnouncements.length}건</span></h2>
        {visibleAnnouncements.length ? (
          <>
            <div className="admin-table-frame hidden md:block">
              <table className="admin-announcement-table w-full table-fixed">
                <thead><tr><th className="w-1/2">제목 · 범위</th><th>상태</th><th>발행 일시</th><th>작성자</th></tr></thead>
                <tbody>
                  {visibleAnnouncements.map((item) => (
                    <tr key={item.id}>
                      <td className="admin-table-name">
                        <button type="button" className="admin-announcement-title" onClick={() => setSelectedAnnouncementId(item.id)} aria-haspopup="dialog">{item.title}</button>
                        <p className="admin-help mt-1">{getScopeLabel(item.scope, item.divisionName)}</p>
                      </td>
                      <td><AnnouncementBadges announcement={item} /></td>
                      <td>{formatBoardDate(getAnnouncementDate(item))}</td>
                      <td className="break-words">{item.createdByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-4 md:hidden">
              {visibleAnnouncements.map((item) => (
                <article key={item.id} className="admin-record-card">
                  <AnnouncementBadges announcement={item} />
                  <h3 className="mt-3"><button type="button" className="admin-announcement-title" onClick={() => setSelectedAnnouncementId(item.id)} aria-haspopup="dialog">{item.title}</button></h3>
                  <p className="mt-2 break-words text-admin-text-secondary">{getPreviewText(item.content)}</p>
                  <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-admin-line-soft pt-4">
                    <p className="admin-help">{getScopeLabel(item.scope, item.divisionName)} · {item.createdByName}</p>
                    <p className="admin-help">{formatBoardDate(getAnnouncementDate(item))}</p>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : <div className="admin-empty-state">{announcements.length ? "검색 조건에 맞는 공지가 없습니다." : "등록된 공지가 없습니다."}</div>}
      </div>

      <SlideOver open={Boolean(selectedAnnouncement)} title="공지 상세" onClose={() => { if (!deletingId) setSelectedAnnouncementId(null); }}
        footer={selectedAnnouncement && canEditAnnouncement(selectedAnnouncement) ? (
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => startEdit(selectedAnnouncement)} disabled={Boolean(deletingId)} className="admin-button"><Pencil className="h-4 w-4" /> 공지 수정</button>
            <button type="button" onClick={() => void handleDelete(selectedAnnouncement)} disabled={Boolean(deletingId)} className="admin-button admin-button-danger-outline">
              {deletingId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} 공지 삭제
            </button>
          </div>
        ) : undefined}>
        {selectedAnnouncement ? (
          <div className="admin-section">
            <AnnouncementBadges announcement={selectedAnnouncement} />
            <h3 className="admin-section-title break-words">{selectedAnnouncement.title}</h3>
            <p className="whitespace-pre-wrap break-words leading-7">{selectedAnnouncement.content}</p>
            <dl className="grid gap-4 border-t border-admin-line-soft pt-4 sm:grid-cols-2">
              {[
                ["공지 범위", getScopeLabel(selectedAnnouncement.scope, selectedAnnouncement.divisionName)],
                ["발행 일시", formatDateTime(getAnnouncementDate(selectedAnnouncement))],
                ["작성자", selectedAnnouncement.createdByName],
                ["최종 수정", formatDateTime(selectedAnnouncement.updatedAt)],
              ].map(([label, value]) => <div key={label}><dt className="admin-label">{label}</dt><dd className="mt-2 break-words">{value}</dd></div>)}
            </dl>
            {!canEditAnnouncement(selectedAnnouncement) ? <p className="admin-help">전체 공지는 최고관리자만 수정·삭제할 수 있습니다.</p> : null}
          </div>
        ) : null}
      </SlideOver>

      <SlideOver
        open={isEditorOpen}
        onClose={() => { if (!isSaving) closeEditor(); }}
        title={editingAnnouncementId ? "공지 수정" : "공지 작성"}
      >
        <form id={`${dialogFormId}-1`} onSubmit={handleSubmit} className="space-y-6">
          <section className="admin-section">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="admin-section-title">공지 기본 정보</h2>
                <p className="admin-help">제목과 본문을 먼저 작성합니다.</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="admin-label mb-2 block">공지 제목</span>
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  className="w-full"
                  placeholder="공지 제목을 입력해 주세요."
                  required
                />
              </label>

              <label className="block">
                <span className="admin-label mb-2 block">공지 내용</span>
                <textarea
                  value={form.content}
                  onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                  className="min-h-[220px] w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition"
                  placeholder="학생과 관리자 화면에 노출될 공지 내용을 입력해 주세요."
                  required
                />
              </label>
            </div>
          </section>

          <section className="admin-section">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="admin-section-title">노출 설정</h2>
                <p className="admin-help">범위, 예약 발행, 상단 고정을 함께 설정합니다.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="admin-label mb-2 block">공지 범위</span>
                <select
                  value={form.scope}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scope: event.target.value as AnnouncementScope }))
                  }
                  className="w-full"
                >
                  <option value="DIVISION">현재 지점 공지</option>
                  {canManageGlobal ? <option value="GLOBAL">전체 공지</option> : null}
                </select>
              </label>

              <label className="block">
                <span className="admin-label mb-2 block">발행 일시</span>
                <input
                  type="datetime-local"
                  value={form.publishedAt}
                  onChange={(event) => setForm((current) => ({ ...current, publishedAt: event.target.value }))}
                  className="w-full"
                />
              </label>
            </div>

            <label className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isPinned}
                onChange={(event) => setForm((current) => ({ ...current, isPinned: event.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-slate-900"
              />
              학생 대시보드 상단에 고정합니다.
            </label>

            <div className="admin-notice mt-4">
              발행 일시를 비워 두면 즉시 공개됩니다. 미래 시점을 지정하면 예약 공지로 등록됩니다.
              {!canManageGlobal
                ? " 전체 공지는 최고관리자만 작성할 수 있습니다."
                : ""}
            </div>
          </section>

          <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">저장 후 목록과 노출 상태가 즉시 반영됩니다.</p>
              <p className="admin-help mt-1">
                예약 공지는 지정된 시점 이후 자동으로 공개됩니다.
              </p>
            </div>

            <DialogActions>
              <button
                type="button"
                onClick={closeEditor}
                disabled={isSaving}
                className="admin-button"
              >
                취소
              </button>
              <button form={`${dialogFormId}-1`}
                type="submit"
                disabled={isSaving}
                className="admin-button admin-button-primary"
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingAnnouncementId ? "공지 수정" : "공지 저장"}
              </button>
            </DialogActions>
          </div>
        </form>
      </SlideOver>
      {confirmDialog}
      {actionCompleteModal}
    </>
  );
}
