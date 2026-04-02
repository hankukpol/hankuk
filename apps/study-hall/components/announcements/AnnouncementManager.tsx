"use client";

import {
  Clock3,
  LoaderCircle,
  Megaphone,
  Pencil,
  Pin,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/sonner";

import { Modal } from "@/components/ui/Modal";
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
  if (announcement.isPinned) {
    return "상단 고정";
  }

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

export function AnnouncementManager({
  divisionSlug,
  initialAnnouncements,
  canManageGlobal,
}: AnnouncementManagerProps) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(
    initialAnnouncements[0]?.id ?? null,
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
    if (visibleAnnouncements.length === 0) {
      if (selectedAnnouncementId !== null) {
        setSelectedAnnouncementId(null);
      }
      return;
    }

    if (!visibleAnnouncements.some((announcement) => announcement.id === selectedAnnouncementId)) {
      setSelectedAnnouncementId(visibleAnnouncements[0].id);
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
      closeEditor();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "공지 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(announcement: AnnouncementItem) {
    if (!window.confirm("이 공지를 삭제하시겠습니까?")) {
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
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">전체 공지</p>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">
                  {announcements.length}
                </p>
                <p className="mt-2 text-xs text-slate-500">지점 공지와 전체 공지를 함께 집계합니다.</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-50 text-slate-600">
                <Megaphone className="h-5 w-5" />
              </div>
            </div>
          </article>

          <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_16px_36px_rgba(245,158,11,0.10)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-amber-700">상단 고정</p>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-amber-950">
                  {pinnedCount}
                </p>
                <p className="mt-2 text-xs text-amber-700/80">학생 홈 상단에 우선 노출되는 공지입니다.</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-white text-amber-700">
                <Pin className="h-5 w-5" />
              </div>
            </div>
          </article>

          <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_16px_36px_rgba(14,165,233,0.10)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-sky-700">예약 공지</p>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-sky-950">
                  {scheduledCount}
                </p>
                <p className="mt-2 text-xs text-sky-700/80">미래 시점에 자동 공개될 공지입니다.</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-white text-sky-700">
                <Clock3 className="h-5 w-5" />
              </div>
            </div>
          </article>

          <article className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_16px_36px_rgba(16,185,129,0.10)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm text-emerald-700">공개 중</p>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-emerald-950">
                  {publishedCount}
                </p>
                <p className="mt-2 text-xs text-emerald-700/80">현재 화면에 노출되는 공지입니다.</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-white text-emerald-700">
                <Megaphone className="h-5 w-5" />
              </div>
            </div>
          </article>
        </section>

        <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_18px_44px_rgba(18,32,56,0.06)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="inline-flex rounded-full border border-slate-200-slate-200 bg-white px-3 py-1 text-xs font-semibold tracking-[0.2em] text-slate-500">
                공지 보드
              </span>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">공지 관리</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                제목과 본문 검색, 공개 상태 필터, 빠른 작성 패널까지 한 화면에서 처리합니다.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[620px]">
              <div className="flex flex-wrap gap-2">
                <label className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchKeyword}
                    onChange={(event) => setSearchKeyword(event.target.value)}
                    className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                    placeholder="제목, 본문, 지점명 검색"
                  />
                </label>

                <select
                  value={filterScope}
                  onChange={(event) => setFilterScope(event.target.value as "ALL" | AnnouncementScope)}
                  className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                >
                  <option value="ALL">전체 범위</option>
                  <option value="DIVISION">지점 공지</option>
                  <option value="GLOBAL">전체 공지</option>
                </select>

                <select
                  value={visibilityFilter}
                  onChange={(event) => setVisibilityFilter(event.target.value as VisibilityFilter)}
                  className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                >
                  <option value="ALL">전체 상태</option>
                  <option value="PUBLISHED">공개 중</option>
                  <option value="SCHEDULED">예약 공지</option>
                  <option value="PINNED">상단 고정</option>
                </select>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void refreshAnnouncements(true)}
                  disabled={isRefreshing}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  {isRefreshing ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-4 w-4" />
                  )}
                  새로고침
                </button>

                <button
                  type="button"
                  onClick={openCreatePanel}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
                >
                  <Plus className="h-4 w-4" />
                  공지 작성
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <section className="overflow-hidden rounded-[10px] border border-slate-200 bg-white">
              {visibleAnnouncements.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-[920px] w-full text-sm">
                      <thead className="bg-[#f8fafc] text-left text-slate-500">
                        <tr>
                          <th className="px-4 py-3 font-medium">번호</th>
                          <th className="px-4 py-3 font-medium">제목</th>
                          <th className="px-4 py-3 font-medium">구분</th>
                          <th className="px-4 py-3 font-medium">상태</th>
                          <th className="px-4 py-3 font-medium">노출 시각</th>
                          <th className="px-4 py-3 font-medium">작성자</th>
                          <th className="px-4 py-3 font-medium">관리</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {visibleAnnouncements.map((announcement, index) => {
                          const isSelected = selectedAnnouncement?.id === announcement.id;

                          return (
                            <tr
                              key={announcement.id}
                              onClick={() => setSelectedAnnouncementId(announcement.id)}
                              className={`cursor-pointer transition ${
                                isSelected ? "bg-slate-50" : "hover:bg-slate-50/80"
                              }`}
                            >
                              <td className="px-4 py-4 align-top text-slate-400">
                                {visibleAnnouncements.length - index}
                              </td>
                              <td className="px-4 py-4 align-top">
                                <div className="max-w-[360px]">
                                  <p className="font-semibold text-slate-950">
                                    {announcement.title}
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-slate-500">
                                    {getPreviewText(announcement.content)}
                                  </p>
                                </div>
                              </td>
                              <td className="px-4 py-4 align-top">
                                <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                                  {getScopeLabel(announcement.scope, announcement.divisionName)}
                                </span>
                              </td>
                              <td className="px-4 py-4 align-top">
                                <div className="flex flex-wrap gap-2">
                                  <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                                    {getVisibilityLabel(announcement)}
                                  </span>
                                  {announcement.isPinned ? (
                                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                                      <Pin className="h-3 w-3" />
                                      상단 고정
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-4 py-4 align-top text-slate-500">
                                {formatBoardDate(getAnnouncementDate(announcement))}
                              </td>
                              <td className="px-4 py-4 align-top text-slate-500">
                                {announcement.createdByName}
                              </td>
                              <td className="px-4 py-4 align-top">
                                {canEditAnnouncement(announcement) ? (
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        startEdit(announcement);
                                      }}
                                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-white"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                      수정
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleDelete(announcement);
                                      }}
                                      disabled={deletingId === announcement.id}
                                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-white disabled:opacity-60"
                                    >
                                      {deletingId === announcement.id ? (
                                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Trash2 className="h-3.5 w-3.5" />
                                      )}
                                      삭제
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400">보기 전용</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
                    목록 행을 클릭하면 우측 상세 패널에서 본문을 확인할 수 있습니다.
                  </div>
                </>
              ) : (
                <div className="px-4 py-8 text-sm text-slate-600">
                  <div className="rounded-[10px] border border-dashed border-slate-300 bg-white px-4 py-8">
                    조건에 맞는 공지가 없습니다.
                  </div>
                </div>
              )}
            </section>

            <aside className="rounded-[10px] border border-slate-200 bg-white p-5">
              {selectedAnnouncement ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                      {getScopeLabel(selectedAnnouncement.scope, selectedAnnouncement.divisionName)}
                    </span>
                    <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                      {getVisibilityLabel(selectedAnnouncement)}
                    </span>
                    {selectedAnnouncement.isPinned ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                        <Pin className="h-3 w-3" />
                        상단 고정
                      </span>
                    ) : null}
                  </div>

                  <h3 className="mt-4 text-2xl font-bold tracking-tight text-slate-950">
                    {selectedAnnouncement.title}
                  </h3>

                  <div className="mt-4 rounded-[10px] border border-slate-200 bg-[#f8fafc] px-4 py-4">
                    <p className="whitespace-pre-line text-sm leading-7 text-slate-700">
                      {selectedAnnouncement.content}
                    </p>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        노출 시각
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">
                        {formatDateTime(getAnnouncementDate(selectedAnnouncement))}
                      </p>
                    </div>

                    <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                        작성 및 수정
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">
                        작성 {formatDateTime(selectedAnnouncement.createdAt)}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        수정 {formatDateTime(selectedAnnouncement.updatedAt)}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        작성자 {selectedAnnouncement.createdByName}
                      </p>
                    </div>
                  </div>

                  {canEditAnnouncement(selectedAnnouncement) ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(selectedAnnouncement)}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      >
                        <Pencil className="h-4 w-4" />
                        선택 공지 수정
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(selectedAnnouncement)}
                        disabled={deletingId === selectedAnnouncement.id}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-rose-700 transition hover:bg-slate-50 disabled:opacity-60"
                      >
                        {deletingId === selectedAnnouncement.id ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        선택 공지 삭제
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-[10px] border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-600">
                  목록에서 공지를 선택하면 상세 내용이 여기 표시됩니다.
                </div>
              )}
            </aside>
          </div>
        </section>
      </div>

      <Modal
        open={isEditorOpen}
        onClose={closeEditor}
        badge={editingAnnouncementId ? "빠른 수정" : "빠른 작성"}
        title={editingAnnouncementId ? "공지 수정" : "공지 작성"}
        description="제목, 본문, 노출 범위와 예약 발행 시점을 우측 패널에서 바로 관리합니다."
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-slate-50 text-slate-600">
                <Megaphone className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-950">공지 기본 정보</p>
                <p className="text-sm text-slate-500">제목과 본문을 먼저 작성합니다.</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">공지 제목</span>
                <input
                  value={form.title}
                  onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  placeholder="공지 제목을 입력해 주세요."
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">공지 내용</span>
                <textarea
                  value={form.content}
                  onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                  className="min-h-[220px] w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  placeholder="학생과 관리자 화면에 노출될 공지 내용을 입력해 주세요."
                  required
                />
              </label>
            </div>
          </section>

          <section className="rounded-[10px] border border-slate-200-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-white text-amber-700">
                <Pin className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-950">노출 설정</p>
                <p className="text-sm text-slate-500">범위, 예약 발행, 상단 고정을 함께 설정합니다.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">공지 범위</span>
                <select
                  value={form.scope}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scope: event.target.value as AnnouncementScope }))
                  }
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                >
                  <option value="DIVISION">현재 지점 공지</option>
                  {canManageGlobal ? <option value="GLOBAL">전체 공지</option> : null}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">발행 일시</span>
                <input
                  type="datetime-local"
                  value={form.publishedAt}
                  onChange={(event) => setForm((current) => ({ ...current, publishedAt: event.target.value }))}
                  className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </label>
            </div>

            <label className="mt-4 flex items-center gap-3 rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isPinned}
                onChange={(event) => setForm((current) => ({ ...current, isPinned: event.target.checked }))}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
              />
              학생 대시보드 상단에 고정합니다.
            </label>

            <div className="mt-4 rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4 text-sm leading-6 text-slate-600">
              발행 일시를 비워 두면 즉시 공개됩니다. 미래 시점을 지정하면 예약 공지로 등록됩니다.
              {!canManageGlobal
                ? " 전체 공지는 최고관리자만 작성할 수 있습니다."
                : ""}
            </div>
          </section>

          <div className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">저장 후 목록과 노출 상태가 즉시 반영됩니다.</p>
              <p className="mt-1 text-sm text-slate-500">
                예약 공지는 지정된 시점 이후 자동으로 공개됩니다.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 sm:mt-0">
              <button
                type="button"
                onClick={closeEditor}
                disabled={isSaving}
                className="inline-flex items-center rounded-full border border-slate-200-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingAnnouncementId ? "공지 수정" : "공지 저장"}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
