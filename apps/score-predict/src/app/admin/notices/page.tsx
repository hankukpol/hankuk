"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import AdminFeatureDisabledState from "@/components/admin/AdminFeatureDisabledState";
import AdminHtmlEditor from "@/components/admin/AdminHtmlEditor";
import ConfirmModal from "@/components/admin/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { useAdminSiteFeature } from "@/hooks/use-admin-site-features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasMeaningfulRichText, richTextToPlainText } from "@/lib/rich-text";

interface NoticeItem {
  id: number;
  title: string;
  content: string;
  isActive: boolean;
  priority: number;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface NoticesResponse {
  notices: NoticeItem[];
  error?: string;
}

type StatusMessage = { type: "success" | "error"; text: string } | null;

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function toDateText(iso: string | null): string {
  if (!iso) return "상시";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "상시";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export default function AdminNoticesPage() {
  const { enabled: noticesEnabled, isLoading: isFeatureLoading } =
    useAdminSiteFeature("notices");
  const [items, setItems] = useState<NoticeItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [message, setMessage] = useState<StatusMessage>(null);
  const { confirm, modalProps } = useConfirmModal();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  const sorted = useMemo(
    () => [...items].sort((a, b) => (a.priority === b.priority ? b.id - a.id : b.priority - a.priority)),
    [items]
  );

  async function load() {
    const response = await fetch("/api/admin/notices", { method: "GET", cache: "no-store" });
    const data = (await response.json()) as NoticesResponse;
    if (!response.ok) {
      throw new Error(data.error ?? "공지 목록을 불러오지 못했습니다.");
    }
    setItems(data.notices ?? []);
  }

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!noticesEnabled) {
      setIsLoading(false);
      setMessage(null);
      return;
    }

    (async () => {
      try {
        setIsLoading(true);
        await load();
      } catch (error) {
        setMessage({
          type: "error",
          text: error instanceof Error ? error.message : "공지 목록을 불러오지 못했습니다.",
        });
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isFeatureLoading, noticesEnabled]);

  function resetForm() {
    setIsFormOpen(false);
    setEditingId(null);
    setTitle("");
    setContent("");
    setPriority(0);
    setIsActive(true);
    setStartAt("");
    setEndAt("");
  }

  function startCreate() {
    resetForm();
    setIsFormOpen(true);
  }

  function startEdit(item: NoticeItem) {
    setIsFormOpen(true);
    setEditingId(item.id);
    setTitle(item.title);
    setContent(item.content);
    setPriority(item.priority);
    setIsActive(item.isActive);
    setStartAt(toDateInput(item.startAt));
    setEndAt(toDateInput(item.endAt));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!title.trim()) {
      setMessage({ type: "error", text: "공지 제목을 입력해 주세요." });
      return;
    }
    if (!hasMeaningfulRichText(content)) {
      setMessage({ type: "error", text: "공지 내용을 입력해 주세요." });
      return;
    }

    const ok = await confirm({ title: editingId ? "공지사항 수정" : "공지사항 등록", description: editingId ? "공지사항을 수정하시겠습니까?" : "공지사항을 등록하시겠습니까?" });
    if (!ok) return;

    try {
      setIsSaving(true);
      const endpoint = editingId ? `/api/admin/notices?id=${editingId}` : "/api/admin/notices";
      const method = editingId ? "PUT" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content,
          priority,
          isActive,
          startAt: startAt ? new Date(startAt).toISOString() : null,
          endAt: endAt ? new Date(endAt).toISOString() : null,
        }),
      });

      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "공지 저장에 실패했습니다.");
      }

      setMessage({
        type: "success",
        text: editingId ? "공지사항이 수정되었습니다." : "공지사항이 등록되었습니다.",
      });
      resetForm();
      await load();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "공지 저장에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const ok = await confirm({ title: "공지사항 삭제", description: "공지사항을 삭제하시겠습니까?", variant: "danger" });
    if (!ok) return;
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/notices?id=${id}`, { method: "DELETE" });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "공지 삭제에 실패했습니다.");
      }

      setMessage({ type: "success", text: "공지사항이 삭제되었습니다." });
      if (editingId === id) resetForm();
      await load();
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "공지 삭제에 실패했습니다.",
      });
    }
  }

  if (isFeatureLoading || (noticesEnabled && isLoading)) {
    return <p className="text-sm text-slate-600">공지사항 관리 화면을 불러오는 중입니다...</p>;
  }

  if (!noticesEnabled) {
    return <AdminFeatureDisabledState feature="notices" />;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">공지사항 게시판 관리</h1>
          <p className="mt-1 text-sm text-slate-600">사용자 화면의 공지사항 탭에 노출될 게시물을 관리합니다.</p>
        </div>
        <Button type="button" onClick={startCreate}>
          새 공지 작성
        </Button>
      </header>

      {message ? (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
 message.type === "success"
 ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
 : "border border-rose-200 bg-rose-50 text-rose-700"
 }`}
        >
          {message.text}
        </p>
      ) : null}

      {isFormOpen ? (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{editingId ? "공지사항 수정" : "새 공지 작성"}</h2>
              <p className="mt-1 text-xs text-slate-600">작성한 내용은 공개 상태와 게시기간 조건에 따라 사용자 게시판에 표시됩니다.</p>
            </div>
            <Button type="button" variant="outline" onClick={resetForm}>
              닫기
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notice-title">제목</Label>
            <Input id="notice-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label>내용</Label>
            <AdminHtmlEditor
              key={`notice-editor-${editingId ?? "new"}`}
              value={content}
              onChange={setContent}
              uploadUrl="/api/admin/notices/upload-image"
              height="360"
              ariaLabel="공지사항 본문 편집기"
            />
            <p className="text-xs text-slate-500">
              글자 서식, 목록, 링크, 이미지 삽입과 HTML 소스 보기를 사용할 수 있습니다. 이미지는 최대 5MB까지 업로드됩니다.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="notice-priority">우선순위</Label>
              <Input
                id="notice-priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value) || 0)}
              />
              <p className="text-xs text-slate-500">1 이상이면 사용자 게시판 상단에 공지로 표시됩니다.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notice-start">게시 시작</Label>
              <Input id="notice-start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notice-end">게시 종료</Label>
              <Input id="notice-end" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            활성 공지로 표시
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={resetForm} disabled={isSaving}>
              취소
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "저장 중..." : editingId ? "수정 저장" : "공지 등록"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="whitespace-nowrap px-4 py-3">ID</th>
              <th className="whitespace-nowrap px-4 py-3">제목</th>
              <th className="whitespace-nowrap px-4 py-3">상태</th>
              <th className="whitespace-nowrap px-4 py-3">게시기간</th>
              <th className="whitespace-nowrap px-4 py-3">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.length < 1 ? (
              <tr>
                <td className="px-4 py-4 text-slate-600" colSpan={5}>
                  등록된 공지사항이 없습니다.
                </td>
              </tr>
            ) : (
              sorted.map((item) => (
                <tr key={item.id} className="bg-white">
                  <td className="px-4 py-3 text-slate-700">{item.id}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{item.title}</p>
                    <p className="mt-1 line-clamp-1 text-xs text-slate-600">{richTextToPlainText(item.content)}</p>
                  </td>
                  <td className="px-4 py-3">
                    {item.isActive ? (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                        활성
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                        비활성
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {toDateText(item.startAt)} ~ {toDateText(item.endAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="inline-flex gap-2">
                      <Button type="button" variant="outline" onClick={() => startEdit(item)}>
                        수정
                      </Button>
                      <Button type="button" variant="outline" onClick={() => void handleDelete(item.id)}>
                        삭제
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal {...modalProps} />
    </div>
  );
}
