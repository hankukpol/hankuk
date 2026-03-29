"use client";

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import AdminFeatureDisabledState from "@/components/admin/AdminFeatureDisabledState";
import ConfirmModal from "@/components/admin/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { useAdminSiteFeature } from "@/hooks/use-admin-site-features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EventItem {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  linkText: string | null;
  bgColor: string;
  isActive: boolean;
  sortOrder: number;
  startAt: string | null;
  endAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EventsResponse {
  events: EventItem[];
}

type NoticeState =
  | {
      type: "success" | "error";
      message: string;
    }
  | null;

function toDateTimeLocalInput(isoText: string | null): string {
  if (!isoText) return "";
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function toDateRangeText(startAt: string | null, endAt: string | null): string {
  const start = startAt ? new Date(startAt) : null;
  const end = endAt ? new Date(endAt) : null;

  const format = (date: Date | null) => {
    if (!date || Number.isNaN(date.getTime())) return "무기한";
    return new Intl.DateTimeFormat("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  };

  return `${format(start)} ~ ${format(end)}`;
}

export default function AdminEventsPage() {
  const { enabled: eventsEnabled, isLoading: isFeatureLoading } =
    useAdminSiteFeature("events");
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [movingId, setMovingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const { confirm, modalProps } = useConfirmModal();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [events]
  );

  async function loadEvents() {
    setIsLoading(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/events", {
        method: "GET",
        cache: "no-store",
      });
      const data = (await response.json()) as EventsResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "이벤트 목록을 불러오지 못했습니다.");
      }
      setEvents(data.events ?? []);
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "이벤트 목록을 불러오지 못했습니다.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (isFeatureLoading) {
      return;
    }

    if (!eventsEnabled) {
      setIsLoading(false);
      setNotice(null);
      return;
    }

    void loadEvents();
  }, [eventsEnabled, isFeatureLoading]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setLinkText("");
    setLinkUrl("");
    setBgColor("#ffffff");
    setIsActive(true);
    setSortOrder(0);
    setStartAt("");
    setEndAt("");
    setImageFile(null);
    setRemoveImage(false);
  }

  function startEdit(item: EventItem) {
    setEditingId(item.id);
    setTitle(item.title);
    setDescription(item.description ?? "");
    setLinkText(item.linkText ?? "");
    setLinkUrl(item.linkUrl ?? "");
    setBgColor(item.bgColor ?? "#ffffff");
    setIsActive(item.isActive);
    setSortOrder(item.sortOrder);
    setStartAt(toDateTimeLocalInput(item.startAt));
    setEndAt(toDateTimeLocalInput(item.endAt));
    setImageFile(null);
    setRemoveImage(false);
  }

  function handleImageFileChange(event: ChangeEvent<HTMLInputElement>) {
    setImageFile(event.target.files?.[0] ?? null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    if (!title.trim()) {
      setNotice({
        type: "error",
        message: "이벤트 제목을 입력해 주세요.",
      });
      return;
    }

    const ok = await confirm({
      title: editingId ? "이벤트 수정" : "이벤트 등록",
      description: editingId ? "이벤트를 수정하시겠습니까?" : "이벤트를 등록하시겠습니까?",
    });
    if (!ok) return;

    setIsSaving(true);

    try {
      const formData = new FormData();
      formData.append("title", title.trim());
      formData.append("description", description.trim());
      formData.append("linkText", linkText.trim());
      formData.append("linkUrl", linkUrl.trim());
      formData.append("bgColor", bgColor.trim());
      formData.append("isActive", String(isActive));
      formData.append("sortOrder", String(Math.max(0, Math.floor(sortOrder))));
      formData.append("startAt", startAt);
      formData.append("endAt", endAt);
      formData.append("removeImage", String(removeImage));
      if (imageFile) {
        formData.append("image", imageFile);
      }

      const endpoint = editingId ? `/api/admin/events?id=${editingId}` : "/api/admin/events";
      const method = editingId ? "PUT" : "POST";

      const response = await fetch(endpoint, {
        method,
        body: formData,
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "이벤트 저장에 실패했습니다.");
      }

      setNotice({
        type: "success",
        message: editingId ? "이벤트가 수정되었습니다." : "이벤트가 등록되었습니다.",
      });
      resetForm();
      await loadEvents();
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "이벤트 저장에 실패했습니다.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(eventId: number) {
    const ok = await confirm({ title: "이벤트 삭제", description: "이 이벤트를 삭제하시겠습니까?", variant: "danger" });
    if (!ok) return;

    setNotice(null);
    try {
      const response = await fetch(`/api/admin/events?id=${eventId}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "이벤트 삭제에 실패했습니다.");
      }

      setNotice({
        type: "success",
        message: "이벤트가 삭제되었습니다.",
      });
      if (editingId === eventId) {
        resetForm();
      }
      await loadEvents();
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "이벤트 삭제에 실패했습니다.",
      });
    }
  }

  async function handleMove(eventId: number, direction: "up" | "down") {
    const currentList = sortedEvents;
    const currentIndex = currentList.findIndex((item) => item.id === eventId);
    if (currentIndex < 0) return;

    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= currentList.length) return;

    const reordered = [...currentList];
    const [moving] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moving);

    setMovingId(eventId);
    setNotice(null);

    try {
      const response = await fetch("/api/admin/events/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventIds: reordered.map((item) => item.id) }),
      });
      const data = (await response.json()) as { success?: boolean; error?: string; message?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? "이벤트 순서 저장에 실패했습니다.");
      }

      setNotice({
        type: "success",
        message: data.message ?? "이벤트 순서가 저장되었습니다.",
      });
      await loadEvents();
    } catch (error) {
      setNotice({
        type: "error",
        message: error instanceof Error ? error.message : "이벤트 순서 저장에 실패했습니다.",
      });
    } finally {
      setMovingId(null);
    }
  }

  if (isFeatureLoading || (eventsEnabled && isLoading)) {
    return <p className="text-sm text-slate-600">이벤트 관리 데이터를 불러오는 중입니다...</p>;
  }

  if (!eventsEnabled) {
    return <AdminFeatureDisabledState feature="events" />;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">이벤트 관리</h1>
        <p className="mt-1 text-sm text-slate-600">
          랜딩 페이지 중간 배너 아래의 이벤트 섹션을 등록/수정/삭제합니다.
        </p>
      </header>

      {notice ? (
        <p
          className={`rounded-md px-3 py-2 text-sm ${
            notice.type === "success"
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {notice.message}
        </p>
      ) : null}

      <form className="space-y-4 rounded-xl border border-slate-200 bg-white p-6" onSubmit={handleSubmit}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            {editingId ? "이벤트 수정" : "새 이벤트 등록"}
          </h2>
          <Button type="button" variant="outline" onClick={resetForm}>
            + 새 이벤트
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="event-title">제목</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예: 조기참여 경품 이벤트"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-sort-order">정렬 순서</Label>
            <Input
              id="event-sort-order"
              type="number"
              min={0}
              step={1}
              value={sortOrder}
              onChange={(event) => setSortOrder(Math.max(0, Number(event.target.value) || 0))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-link-text">버튼 텍스트</Label>
            <Input
              id="event-link-text"
              value={linkText}
              onChange={(event) => setLinkText(event.target.value)}
              placeholder="예: 참여하기"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-link-url">버튼 링크 URL</Label>
            <Input
              id="event-link-url"
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="https://example.com 또는 /path"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-bg-color">배경색</Label>
            <div className="flex items-center gap-2">
              <Input
                id="event-bg-color"
                value={bgColor}
                onChange={(event) => setBgColor(event.target.value)}
                placeholder="#ffffff"
              />
              <Input
                type="color"
                value={bgColor}
                onChange={(event) => setBgColor(event.target.value)}
                className="h-10 w-16 rounded-md border border-slate-300 p-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-image">이미지 업로드 (jpg/png/webp, 5MB 이하)</Label>
            <Input id="event-image" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={handleImageFileChange} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="event-description">설명</Label>
          <textarea
            id="event-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="event-start-at">표시 시작일</Label>
            <Input
              id="event-start-at"
              type="datetime-local"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-end-at">표시 종료일</Label>
            <Input
              id="event-end-at"
              type="datetime-local"
              value={endAt}
              onChange={(event) => setEndAt(event.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
            활성 이벤트로 표시
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={removeImage}
              onChange={(event) => setRemoveImage(event.target.checked)}
            />
            기존 이미지 제거
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "저장 중..." : editingId ? "이벤트 수정" : "이벤트 등록"}
          </Button>
          {editingId ? (
            <Button type="button" variant="outline" onClick={resetForm} disabled={isSaving}>
              입력 초기화
            </Button>
          ) : null}
        </div>
      </form>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-[920px] w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">순서</th>
              <th className="px-4 py-3">제목</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">표시 기간</th>
              <th className="px-4 py-3 text-right">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sortedEvents.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-600" colSpan={5}>
                  등록된 이벤트가 없습니다.
                </td>
              </tr>
            ) : (
              sortedEvents.map((item, index) => (
                <tr key={item.id} className="bg-white">
                  <td className="px-4 py-3 text-slate-700">
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-center text-xs font-semibold text-slate-500">
                        {item.sortOrder}
                      </span>
                      <div className="flex flex-col gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={index === 0 || movingId !== null}
                          onClick={() => void handleMove(item.id, "up")}
                        >
                          ↑
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={index === sortedEvents.length - 1 || movingId !== null}
                          onClick={() => void handleMove(item.id, "down")}
                        >
                          ↓
                        </Button>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{item.title}</p>
                    {item.description ? (
                      <p className="mt-1 line-clamp-1 text-xs text-slate-600">{item.description}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {item.isActive ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                        활성
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                        비활성
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{toDateRangeText(item.startAt, item.endAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => startEdit(item)}>
                        수정
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-rose-600 hover:text-rose-700"
                        onClick={() => void handleDelete(item.id)}
                      >
                        삭제
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <ConfirmModal {...modalProps} />
    </div>
  );
}
