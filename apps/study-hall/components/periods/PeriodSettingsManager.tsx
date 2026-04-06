"use client";

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Clock3,
  GripVertical,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "@/lib/sonner";

import { useActionCompleteModal } from "@/components/ui/useActionCompleteModal";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";

type PeriodItem = {
  id: string;
  name: string;
  label: string | null;
  displayOrder: number;
  startTime: string;
  endTime: string;
  isMandatory: boolean;
  isActive: boolean;
};

type PeriodSettingsManagerProps = {
  divisionSlug: string;
  initialPeriods: PeriodItem[];
};

const defaultForm = {
  name: "",
  label: "",
  startTime: "09:00",
  endTime: "10:00",
  isMandatory: true,
  isActive: true,
};

type ApiErrorResponse = {
  error?: string;
};

async function readJsonSafely<T>(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function SortablePeriodRow({
  period,
  onEdit,
  onDelete,
  isDeleting,
}: {
  period: PeriodItem;
  onEdit: (period: PeriodItem) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: period.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`rounded-[10px] border px-4 py-4 transition ${
        isDragging ? "border-slate-400 bg-slate-100 shadow-lg" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start gap-3">
        <button
          type="button"
          className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200-slate-200 text-slate-500 touch-none"
          aria-label="교시 순서 이동"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-bold text-slate-950">{period.name}</p>
            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ${
                period.isMandatory
                  ? "bg-slate-950 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {period.isMandatory ? "필수" : "선택"}
            </span>
            <span
              className={`rounded-full px-2 py-1 text-xs font-medium ${
                period.isActive
                  ? "bg-white border border-slate-200-slate-200 text-emerald-700"
                  : "bg-white border border-slate-200-slate-200 text-red-700"
              }`}
            >
              {period.isActive ? "활성" : "비활성"}
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-500">{period.label || "부제 없음"}</p>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
            <span className="inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4" />
              {period.startTime} - {period.endTime}
            </span>
            <span>순서 {period.displayOrder + 1}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEdit(period)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200-slate-200 text-slate-600 transition hover:bg-slate-50"
            aria-label="교시 수정"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(period.id)}
            disabled={isDeleting}
            className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-slate-200-slate-200 text-red-600 transition hover:bg-slate-50 disabled:opacity-60"
            aria-label="교시 삭제"
          >
            {isDeleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PeriodSettingsManager({
  divisionSlug,
  initialPeriods,
}: PeriodSettingsManagerProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [periods, setPeriods] = useState<PeriodItem[]>(initialPeriods);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { showActionComplete, actionCompleteModal } = useActionCompleteModal();
  const { confirm, confirmDialog } = useConfirmDialog();

  const orderedPeriods = useMemo(
    () => [...periods].sort((left, right) => left.displayOrder - right.displayOrder),
    [periods],
  );

  function resetForm() {
    setEditingId(null);
    setForm(defaultForm);
  }

  function fillForm(period: PeriodItem) {
    setEditingId(period.id);
    setForm({
      name: period.name,
      label: period.label ?? "",
      startTime: period.startTime,
      endTime: period.endTime,
      isMandatory: period.isMandatory,
      isActive: period.isActive,
    });
  }

  async function refreshPeriods() {
    setIsRefreshing(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/periods`, {
        cache: "no-store",
      });
      const data = (await readJsonSafely<{ periods?: PeriodItem[] } & ApiErrorResponse>(response)) ?? {};

      if (!response.ok) {
        throw new Error(data.error ?? "교시 목록을 불러오지 못했습니다.");
      }

      if (!data.periods) {
        throw new Error("교시 목록 응답 형식이 올바르지 않습니다.");
      }

      setPeriods(data.periods);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "교시 목록 새로고침에 실패했습니다.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const endpoint = editingId
        ? `/api/${divisionSlug}/periods/${editingId}`
        : `/api/${divisionSlug}/periods`;
      const method = editingId ? "PATCH" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const data = (await readJsonSafely<ApiErrorResponse>(response)) ?? {};

      if (!response.ok) {
        throw new Error(data.error ?? "교시 저장에 실패했습니다.");
      }

      toast.success(editingId ? "교시를 수정했습니다." : "교시를 추가했습니다.");
      await refreshPeriods();
      resetForm();
      showActionComplete({
        title: editingId ? "교시 수정 완료" : "교시 추가 완료",
        description: editingId ? "교시 정보가 수정되었습니다." : "새 교시가 추가되었습니다.",
        notice: "저장한 교시 정보는 출석 체크와 학습시간 계산에 바로 반영됩니다.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "교시 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = await confirm({
      title: "교시 삭제",
      description: "이 교시를 삭제하시겠습니까?",
      confirmLabel: "삭제",
      variant: "danger",
    });

    if (!confirmed) {
      return;
    }

    setDeletingId(id);

    try {
      const response = await fetch(`/api/${divisionSlug}/periods/${id}`, {
        method: "DELETE",
      });
      const data = (await readJsonSafely<{ periods?: PeriodItem[] } & ApiErrorResponse>(response)) ?? {};

      if (!response.ok) {
        throw new Error(data.error ?? "교시 삭제에 실패했습니다.");
      }

      if (!data.periods) {
        throw new Error("교시 목록 응답 형식이 올바르지 않습니다.");
      }

      setPeriods(data.periods);
      toast.success("교시를 삭제했습니다.");
      showActionComplete({
        title: "교시 삭제 완료",
        description: "선택한 교시가 삭제되었습니다.",
        notice: "삭제한 교시는 이후 출석 체크 대상에서 제외됩니다.",
      });

      if (editingId === id) {
        resetForm();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "교시 삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const previous = orderedPeriods;
    const oldIndex = orderedPeriods.findIndex((period) => period.id === active.id);
    const newIndex = orderedPeriods.findIndex((period) => period.id === over.id);
    const reordered = arrayMove(orderedPeriods, oldIndex, newIndex).map((period, index) => ({
      ...period,
      displayOrder: index,
    }));

    setPeriods(reordered);

    try {
      const response = await fetch(`/api/${divisionSlug}/periods/${String(active.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reorderIds: reordered.map((period) => period.id),
        }),
      });
      const data = (await readJsonSafely<{ result?: PeriodItem[] } & ApiErrorResponse>(response)) ?? {};

      if (!response.ok) {
        throw new Error(data.error ?? "교시 순서 변경에 실패했습니다.");
      }

      if (!data.result) {
        throw new Error("교시 목록 응답 형식이 올바르지 않습니다.");
      }

      setPeriods(data.result);
      toast.success("교시 순서를 변경했습니다.");
    } catch (error) {
      setPeriods(previous);
      toast.error(error instanceof Error ? error.message : "교시 순서 변경에 실패했습니다.");
    }
  }

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              교시 목록
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">교시 목록 정렬</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              드래그로 순서를 바꾸고, 각 교시의 시간과 활성 상태를 관리할 수 있습니다.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshPeriods}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              {isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              새로고침
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              새 교시
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedPeriods.map((period) => period.id)} strategy={verticalListSortingStrategy}>
              {orderedPeriods.map((period) => (
                <SortablePeriodRow
                  key={period.id}
                  period={period}
                  onEdit={fillForm}
                  onDelete={handleDelete}
                  isDeleting={deletingId === period.id}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
        </section>

        <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          {editingId ? "교시 수정" : "교시 추가"}
        </p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">
          {editingId ? "교시 수정" : "새 교시 추가"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          출석 의무 여부와 활성 상태는 이후 출석 체크 대상 계산에 직접 사용됩니다.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">교시 이름</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              placeholder="예: 1교시"
              required
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">부제</span>
            <input
              value={form.label}
              onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
              className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              placeholder="예: 아침 모의고사"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">시작 시간</span>
              <input
                type="time"
                value={form.startTime}
                onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
                className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">종료 시간</span>
              <input
                type="time"
                value={form.endTime}
                onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))}
                className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                required
              />
            </label>
          </div>

          <label className="flex items-center justify-between rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-slate-800">필수 교시</span>
              <span className="block text-xs text-slate-500">출석률 계산 대상 교시로 포함합니다.</span>
            </span>
            <input
              type="checkbox"
              checked={form.isMandatory}
              onChange={(event) =>
                setForm((current) => ({ ...current, isMandatory: event.target.checked }))
              }
              className="h-5 w-5 rounded border-slate-300"
            />
          </label>

          <label className="flex items-center justify-between rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-slate-800">활성 상태</span>
              <span className="block text-xs text-slate-500">비활성 교시는 출석 체크 대상에서 제외됩니다.</span>
            </span>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              className="h-5 w-5 rounded border-slate-300"
            />
          </label>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingId ? "교시 수정" : "교시 추가"}
            </button>

            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              초기화
            </button>
          </div>
        </form>
        </section>
      </div>
      {confirmDialog}
      {actionCompleteModal}
    </>
  );
}
