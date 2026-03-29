"use client";

import {
  ArrowRight,
  LoaderCircle,
  Megaphone,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type GlobalAnnouncement = {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  createdByName: string;
  createdAt: string;
  publishedAt: string | null;
  isPublished: boolean;
};

type FormState = {
  title: string;
  content: string;
  isPinned: boolean;
  publishedAt: string;
};

function toFormState(item?: GlobalAnnouncement | null): FormState {
  return {
    title: item?.title ?? "",
    content: item?.content ?? "",
    isPinned: item?.isPinned ?? false,
    publishedAt: item?.publishedAt ? item.publishedAt.slice(0, 16) : "",
  };
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function SuperAdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<GlobalAnnouncement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(toFormState());
  const mountedRef = useRef(true);

  const fetchAnnouncements = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/super-admin/announcements", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "불러오기 실패");
      if (mountedRef.current) setAnnouncements(data.announcements ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "공지사항을 불러오지 못했습니다.");
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchAnnouncements();
    return () => { mountedRef.current = false; };
  }, [fetchAnnouncements]);

  function openCreate() {
    setEditingId(null);
    setForm(toFormState());
    setShowForm(true);
  }

  function openEdit(item: GlobalAnnouncement) {
    setEditingId(item.id);
    setForm(toFormState(item));
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(toFormState());
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("제목과 내용을 입력해주세요.");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        isPinned: form.isPinned,
        publishedAt: form.publishedAt.trim() || null,
      };

      const res = editingId
        ? await fetch(`/api/super-admin/announcements/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/super-admin/announcements", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "저장 실패");

      toast.success(editingId ? "공지사항을 수정했습니다." : "전체 공지사항을 등록했습니다.");
      cancelForm();
      await fetchAnnouncements();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      if (mountedRef.current) setIsSaving(false);
    }
  }

  async function handleTogglePin(item: GlobalAnnouncement) {
    try {
      const res = await fetch(`/api/super-admin/announcements/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: !item.isPinned }),
      });
      if (!res.ok) throw new Error("수정 실패");
      toast.success(item.isPinned ? "핀을 해제했습니다." : "공지를 상단 고정했습니다.");
      await fetchAnnouncements();
    } catch {
      toast.error("처리에 실패했습니다.");
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`"${title}" 공지사항을 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/super-admin/announcements/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제 실패");
      toast.success("공지사항을 삭제했습니다.");
      await fetchAnnouncements();
    } catch {
      toast.error("삭제에 실패했습니다.");
    }
  }

  const inputCls =
    "w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400 focus:bg-white";

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            Announcements
          </p>
          <h2 className="mt-2 text-3xl font-extrabold text-slate-950">전체 공지사항</h2>
          <p className="mt-1 text-sm text-slate-500">
            모든 지점 학생 포탈에 동시 표시되는 전체 공지입니다.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-[10px] bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          공지 등록
        </button>
      </div>

      {/* 작성/수정 폼 */}
      {showForm && (
        <section className="rounded-[10px] border border-black/5 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">
              {editingId ? "공지사항 수정" : "새 전체 공지 등록"}
            </h3>
            <button type="button" onClick={cancelForm} className="text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">제목 *</label>
              <input
                className={inputCls}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="공지 제목을 입력하세요"
                maxLength={120}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">내용 *</label>
              <textarea
                className={`${inputCls} resize-none`}
                rows={5}
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="공지 내용을 입력하세요"
                maxLength={3000}
              />
            </div>

            <div className="flex flex-wrap items-end gap-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  예약 발행 일시 (비워두면 즉시 공개)
                </label>
                <input
                  type="datetime-local"
                  className={inputCls}
                  value={form.publishedAt}
                  onChange={(e) => setForm((f) => ({ ...f, publishedAt: e.target.value }))}
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isPinned}
                  onChange={(e) => setForm((f) => ({ ...f, isPinned: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300"
                />
                상단 고정
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={cancelForm}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-[10px] bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {editingId ? "수정 완료" : "등록하기"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 공지 목록 */}
      <section>
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <LoaderCircle className="h-6 w-6 animate-spin" />
          </div>
        ) : announcements.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-slate-300 bg-white py-20 text-center">
            <Megaphone className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-base text-slate-400">등록된 전체 공지가 없습니다.</p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              <Plus className="h-4 w-4" />
              첫 공지 등록하기
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {announcements.map((item) => (
              <article
                key={item.id}
                className={`rounded-[10px] border bg-white p-5 shadow-[0_18px_44px_rgba(15,23,42,0.06)] transition hover:shadow-[0_18px_50px_rgba(15,23,42,0.10)] ${
                  item.isPinned ? "border-black/10" : "border-black/5"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.isPinned && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          <Pin className="h-3 w-3" />
                          고정
                        </span>
                      )}
                      {!item.isPublished && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                          예약됨 {item.publishedAt ? formatDate(item.publishedAt) : ""}
                        </span>
                      )}
                      <h4 className="text-base font-bold text-slate-900">{item.title}</h4>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                      {item.content}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      {item.createdByName} · {formatDate(item.createdAt)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void handleTogglePin(item)}
                      className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
                      title={item.isPinned ? "고정 해제" : "상단 고정"}
                    >
                      {item.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
                      title="수정"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(item.id, item.title)}
                      className="rounded-full border border-red-100 p-2 text-red-400 transition hover:bg-red-50"
                      title="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* 안내 */}
      <section className="rounded-[10px] border border-black/5 bg-slate-50 p-4">
        <p className="flex items-start gap-2 text-sm text-slate-600">
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          전체 공지는 경찰반·소방반 등 모든 지점의 학생 포탈 공지란에 함께 표시됩니다.
          각 지점 공지사항은 해당 지점 관리자 페이지에서 관리하세요.
        </p>
      </section>
    </div>
  );
}
