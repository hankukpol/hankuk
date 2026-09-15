"use client";
import { useConfigurationReview } from "@/components/settings/ConfigurationReview";
import { MobileWorkspaceTools } from "@/components/ui/MobileWorkspaceTools";

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
import { useId, useMemo, useState } from "react";
import { toast } from "@/lib/sonner";

import { useActionCompleteModal } from "@/components/ui/useActionCompleteModal";
import { DialogActions } from "@/components/ui/DialogActions";
import { SlideOver } from "@/components/ui/SlideOver";

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
  policyEnabled?: boolean;
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
      className="admin-choice-card"
      data-dragging={isDragging}
    >
      <div className="flex flex-wrap items-start gap-3">
        <button
          type="button"
          className="admin-button admin-button-compact w-11 px-0 mt-1"
          aria-label="교시 순서 이동"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="admin-section-title">{period.name}</h2>
            <span
              className="admin-badge"
            >
              {period.isMandatory ? "필수" : "선택"}
            </span>
            <span
              className="admin-badge"
            >
              {period.isActive ? "활성" : "비활성"}
            </span>
          </div>

          <p className="admin-help mt-1">{period.label || "부제 없음"}</p>

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
            className="admin-button admin-button-compact w-11 px-0"
            aria-label="교시 수정"
            title="교시 수정"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(period.id)}
            disabled={isDeleting}
            className="admin-button admin-button-compact admin-button-danger-outline w-11 px-0"
            aria-label="교시 비활성화"
            title="교시 비활성화"
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
  policyEnabled = false,
}: PeriodSettingsManagerProps) {
  const {review, dialog} = useConfigurationReview(divisionSlug);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [periods, setPeriods] = useState<PeriodItem[]>(initialPeriods);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const editorFormId = useId();
  const { showActionComplete, actionCompleteModal } = useActionCompleteModal();

  const orderedPeriods = useMemo(
    () => [...periods].sort((left, right) => left.displayOrder - right.displayOrder),
    [periods],
  );

  function openCreateEditor() {
    setEditingId(null);
    setForm(defaultForm);
    setIsEditorOpen(true);
  }

  function closeEditor() {
    if (isSaving) return;
    setIsEditorOpen(false);
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
    setIsEditorOpen(true);
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
      const result=await review("교시 설정 변경", current=>{
        const next={...form,label:form.label.trim()||null};
        current.periods=editingId ? current.periods.map(p=>p.id===editingId?{...p,...next}:p) : [...current.periods,{...next,id:crypto.randomUUID(),displayOrder:current.periods.length}];
        return current;
      });
      if(result?.status!=="APPLIED"){if(result?.status==="PENDING")setIsEditorOpen(false);return;}
      toast.success(editingId ? "교시를 수정했습니다." : "교시를 추가했습니다.");
      await refreshPeriods();
      setIsEditorOpen(false);
      setEditingId(null);
      setForm(defaultForm);
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
    setDeletingId(id);

    try {
      const result=await review("교시 비활성화", current=>({...current,periods:current.periods.map(p=>p.id===id?{...p,isActive:false}:p)}));
      if(result?.status!=="APPLIED"){if(result?.status==="PENDING")setIsEditorOpen(false);return;}
      await refreshPeriods();
      toast.success("기존 출결을 보존하고 교시를 비활성화했습니다.");
      if (editingId === id) {
        closeEditor();
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
        <section className="admin-section">
        <MobileWorkspaceTools title="교시 목록 작업">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="admin-section-title">교시 목록 정렬</h2>
            <p className="admin-help mt-2 leading-6">
              드래그로 순서를 바꾸고, 각 교시의 시간과 활성 상태를 관리할 수 있습니다.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={refreshPeriods}
              disabled={isRefreshing}
              className="admin-button"
            >
              {isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              새로고침
            </button>
            <button
              type="button"
              onClick={openCreateEditor}
              className="admin-button admin-button-primary"
            >
              <Plus className="h-4 w-4" />
              새 교시
            </button>
          </div>
        </div>

        </MobileWorkspaceTools>
        <div className="mt-5 space-y-3 max-md:mt-0">
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
      <SlideOver
        open={isEditorOpen}
        title={editingId ? "교시 수정" : "새 교시 추가"}
        description="활성 교시는 출석 입력 목록에 표시되며 저장 즉시 운영 화면에 반영됩니다."
        onClose={closeEditor}
      >
        <form id={editorFormId} onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="admin-label mb-2 block">교시 이름</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full"
              placeholder="예: 1교시"
              required
            />
          </label>

          <label className="block">
            <span className="admin-label mb-2 block">부제</span>
            <input
              value={form.label}
              onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
              className="w-full"
              placeholder="예: 아침 모의고사"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="admin-label mb-2 block">시작 시간</span>
              <input
                type="time"
                value={form.startTime}
                onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))}
                className="w-full"
                required
              />
            </label>

            <label className="block">
              <span className="admin-label mb-2 block">종료 시간</span>
              <input
                type="time"
                value={form.endTime}
                onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))}
                className="w-full"
                required
              />
            </label>
          </div>

          <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
            <span>
              <span className="admin-label block">필수 교시</span>
              <span className="admin-help block">{policyEnabled
                ? "관리규정 적용 중에는 규정의 대상 교시와 요일로 의무 출석을 판단합니다."
                : "출석률 계산 대상 교시로 포함합니다."}</span>
            </span>
            <input
              type="checkbox"
              checked={form.isMandatory}
              disabled={policyEnabled}
              onChange={(event) =>
                setForm((current) => ({ ...current, isMandatory: event.target.checked }))
              }
              className="h-5 w-5 rounded border-slate-300"
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
            <span>
              <span className="admin-label block">활성 상태</span>
              <span className="admin-help block">비활성 교시는 출석 체크 대상에서 제외됩니다.</span>
            </span>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              className="h-5 w-5 rounded border-slate-300"
            />
          </label>

          <DialogActions>
            <button
              type="button"
              onClick={closeEditor}
              disabled={isSaving}
              className="admin-button"
            >
              취소
            </button>
            <button
              type="submit"
              form={editorFormId}
              disabled={isSaving}
              className="admin-button admin-button-primary"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingId ? "교시 수정" : "교시 추가"}
            </button>
          </DialogActions>
        </form>
      </SlideOver>
      {dialog}
      {actionCompleteModal}
    </>
  );
}
