"use client";

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, LoaderCircle, Pencil, Plus, RefreshCcw, Save, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/sonner";

import { useActionCompleteModal } from "@/components/ui/useActionCompleteModal";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import type { ExamTypeItem } from "@/lib/services/exam.service";

type Props = {
  divisionSlug: string;
  initialExamTypes: ExamTypeItem[];
  studyTrackOptions: string[];
};

export type ExamTypeManagerProps = Props;

type SubjectFormItem = {
  id?: string;
  localId: string;
  name: string;
  totalItems: string;
  pointsPerItem: string;
  isActive: boolean;
};

type FormState = {
  name: string;
  category: "MORNING" | "REGULAR";
  studyTrack: string;
  isActive: boolean;
  subjects: SubjectFormItem[];
};

const COMMON_TRACK_VALUE = "__COMMON__";

function createSubject(localId = `subject-${Date.now()}`): SubjectFormItem {
  return { localId, name: "", totalItems: "20", pointsPerItem: "5", isActive: true };
}

function createDefaultForm(): FormState {
  return {
    name: "",
    category: "REGULAR",
    studyTrack: COMMON_TRACK_VALUE,
    isActive: true,
    subjects: [createSubject("subject-0")],
  };
}

function toFormState(examType: ExamTypeItem): FormState {
  return {
    name: examType.name,
    category: examType.category,
    studyTrack: examType.studyTrack ?? COMMON_TRACK_VALUE,
    isActive: examType.isActive,
    subjects: examType.subjects.length > 0
      ? examType.subjects.map((subject) => ({
          id: subject.id,
          localId: subject.id,
          name: subject.name,
          totalItems: subject.totalItems?.toString() ?? "",
          pointsPerItem: subject.pointsPerItem?.toString() ?? "",
          isActive: subject.isActive,
        }))
      : [createSubject()],
  };
}

function toCopyFormState(examType: ExamTypeItem): FormState {
  const seed = Date.now();
  return {
    name: `${examType.name} 복사본`,
    category: examType.category,
    studyTrack: examType.studyTrack ?? COMMON_TRACK_VALUE,
    isActive: examType.isActive,
    subjects: examType.subjects.length > 0
      ? examType.subjects.map((subject, index) => ({
          localId: `copy-${seed}-${index}`,
          name: subject.name,
          totalItems: subject.totalItems?.toString() ?? "",
          pointsPerItem: subject.pointsPerItem?.toString() ?? "",
          isActive: subject.isActive,
        }))
      : [createSubject(`copy-${seed}-0`)],
  };
}

function buildRequestBody(form: FormState) {
  return {
    name: form.name,
    category: form.category,
    studyTrack: form.studyTrack === COMMON_TRACK_VALUE ? null : form.studyTrack,
    isActive: form.isActive,
    subjects: form.subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      totalItems: subject.totalItems.trim() ? Number(subject.totalItems.trim()) : null,
      pointsPerItem: subject.pointsPerItem.trim() ? Number(subject.pointsPerItem.trim()) : null,
      isActive: subject.isActive,
    })),
  };
}

function getTrackLabel(track: string | null) {
  return track || "공통";
}

function getCategoryLabel(category: "MORNING" | "REGULAR") {
  return category === "MORNING" ? "아침" : "정기";
}

function calculateMaxScore(totalItems: string, pointsPerItem: string) {
  const count = Number(totalItems.trim());
  const point = Number(pointsPerItem.trim());
  return Number.isFinite(count) && Number.isFinite(point) ? count * point : null;
}

function summarizeExamType(examType: ExamTypeItem) {
  const activeSubjects = examType.subjects.filter((subject) => subject.isActive);
  const totalMaxScore = activeSubjects.reduce((sum, subject) => sum + (subject.maxScore ?? 0), 0);
  return {
    subjectNames: activeSubjects.map((subject) => subject.name).join(", ") || "활성 과목이 없습니다.",
    activeSubjectCount: activeSubjects.length,
    totalMaxScore: totalMaxScore > 0 ? totalMaxScore : null,
  };
}

function ExamTypeManagerSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <section className="rounded-[10px] border border-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="h-4 w-20 rounded bg-slate-100" />
            <div className="h-8 w-44 rounded bg-slate-100" />
            <div className="h-4 w-80 rounded bg-slate-100" />
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-24 rounded-full bg-slate-100" />
            <div className="h-10 w-28 rounded-full bg-slate-100" />
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-[12px] border border-slate-200 bg-white px-4 py-4">
              <div className="flex items-start gap-3">
                <div className="mt-1 h-10 w-10 rounded-[10px] bg-slate-100" />
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="h-5 w-36 rounded bg-slate-100" />
                      <div className="h-5 w-12 rounded-full bg-slate-100" />
                      <div className="h-5 w-16 rounded-full bg-slate-100" />
                    </div>
                    <div className="flex gap-2">
                      <div className="h-10 w-10 rounded-[10px] bg-slate-100" />
                      <div className="h-10 w-24 rounded-[10px] bg-slate-100" />
                      <div className="h-10 w-10 rounded-[10px] bg-slate-100" />
                    </div>
                  </div>
                  <div className="h-4 w-72 rounded bg-slate-100" />
                  <div className="h-4 w-40 rounded bg-slate-100" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[10px] border border-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="space-y-2">
          <div className="h-4 w-20 rounded bg-slate-100" />
          <div className="h-8 w-36 rounded bg-slate-100" />
          <div className="h-4 w-96 rounded bg-slate-100" />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-[12px] border border-slate-200 px-4 py-4">
              <div className="h-4 w-16 rounded bg-slate-100" />
              <div className="mt-3 h-8 w-20 rounded bg-slate-100" />
            </div>
          ))}
        </div>
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="h-24 rounded-[12px] border border-slate-200 bg-slate-50" />
            <div className="h-24 rounded-[12px] border border-slate-200 bg-slate-50" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="h-20 rounded-[12px] border border-slate-200 bg-slate-50" />
            <div className="h-20 rounded-[12px] border border-slate-200 bg-slate-50" />
          </div>
          <div className="h-14 rounded-[12px] border border-slate-200 bg-slate-50" />
          <div className="rounded-[12px] border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-2">
                <div className="h-5 w-20 rounded bg-slate-100" />
                <div className="h-4 w-48 rounded bg-slate-100" />
              </div>
              <div className="h-10 w-24 rounded-full bg-slate-100" />
            </div>
            <div className="mt-4 space-y-3">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="rounded-[12px] border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="h-4 w-12 rounded bg-slate-100" />
                    <div className="h-9 w-9 rounded-[10px] bg-slate-100" />
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
                    <div className="h-12 rounded-[12px] bg-slate-100" />
                    <div className="h-12 rounded-[12px] bg-slate-100" />
                    <div className="h-12 rounded-[12px] bg-slate-100" />
                    <div className="h-12 rounded-[12px] bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SortableExamTypeCard({
  examType,
  isSelected,
  isDeleting,
  isCopySource,
  onSelect,
  onCopy,
  onDelete,
}: {
  examType: ExamTypeItem;
  isSelected: boolean;
  isDeleting: boolean;
  isCopySource: boolean;
  onSelect: (examType: ExamTypeItem) => void;
  onCopy: (examType: ExamTypeItem) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: examType.id });
  const summary = summarizeExamType(examType);

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-[12px] border px-4 py-4 transition ${
        isDragging
          ? "border-slate-400 bg-slate-100 shadow-lg"
          : isSelected
            ? "border-[var(--division-color)] bg-[var(--division-color)] text-white"
            : "border-slate-200 bg-white text-slate-950"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className={`mt-1 inline-flex h-10 w-10 shrink-0 cursor-grab touch-none items-center justify-center rounded-[10px] border transition active:cursor-grabbing ${
            isSelected ? "border-white/20 bg-white/10 text-white hover:bg-white/15" : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
          }`}
          aria-label="시험 템플릿 순서 이동"
          title="시험 템플릿 순서 이동"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <button type="button" onClick={() => onSelect(examType)} className="min-w-0 flex-1 text-left">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold">{examType.name}</span>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"}`}>{getCategoryLabel(examType.category)}</span>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"}`}>직렬 {getTrackLabel(examType.studyTrack)}</span>
                {isCopySource ? <span className={`rounded-full px-2 py-1 text-xs font-medium ${isSelected ? "bg-white/20 text-white" : "bg-slate-900 text-white"}`}>복사 기준</span> : null}
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"}`}>순서 {examType.displayOrder + 1}</span>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${isSelected ? "bg-white/20 text-white" : examType.isActive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{examType.isActive ? "활성" : "비활성"}</span>
              </span>
              <span className={`mt-2 block text-sm ${isSelected ? "text-white/75" : "text-slate-500"}`}>{summary.subjectNames}</span>
              <span className={`mt-1 block text-xs ${isSelected ? "text-white/70" : "text-slate-400"}`}>
                과목 수 {summary.activeSubjectCount}개{summary.totalMaxScore ? ` · 예상 총점 ${summary.totalMaxScore}점` : ""}
              </span>
            </button>

            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => onSelect(examType)} className={`inline-flex h-10 w-10 items-center justify-center rounded-[10px] border transition ${isSelected ? "border-white/20 text-white hover:bg-white/10" : "border-slate-200 text-slate-600 hover:bg-white"}`} aria-label="시험 템플릿 수정"><Pencil className="h-4 w-4" /></button>
              <button type="button" onClick={() => onCopy(examType)} className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-sm font-medium transition ${isSelected ? "border-white/20 text-white hover:bg-white/10" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}><Copy className="h-4 w-4" />시험 템플릿 복사</button>
              <button type="button" onClick={() => onDelete(examType.id)} disabled={isDeleting} className={`inline-flex h-10 w-10 items-center justify-center rounded-[10px] border transition ${isSelected ? "border-white/20 text-white hover:bg-white/10" : "border-slate-200 text-rose-600 hover:bg-white"} disabled:opacity-60`} aria-label="시험 템플릿 삭제">{isDeleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ExamTypeManager({ divisionSlug, initialExamTypes, studyTrackOptions }: Props) {
  const [isReady, setIsReady] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [examTypes, setExamTypes] = useState(initialExamTypes);
  const [selectedId, setSelectedId] = useState<string | null>(initialExamTypes[0]?.id ?? null);
  const [editingId, setEditingId] = useState<string | null>(initialExamTypes[0]?.id ?? null);
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => initialExamTypes[0] ? toFormState(initialExamTypes[0]) : createDefaultForm());
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { showActionComplete, actionCompleteModal } = useActionCompleteModal();
  const { confirm, confirmDialog } = useConfirmDialog();

  useEffect(() => {
    setIsReady(true);
  }, []);

  const orderedExamTypes = useMemo(() => [...examTypes].sort((a, b) => a.displayOrder - b.displayOrder), [examTypes]);
  const trackOptions = useMemo(
    () => Array.from(new Set([...studyTrackOptions, ...orderedExamTypes.map((item) => item.studyTrack).filter((value): value is string => Boolean(value))])),
    [orderedExamTypes, studyTrackOptions],
  );
  const copySourceName = orderedExamTypes.find((item) => item.id === copySourceId)?.name ?? null;
  const activeSubjectCount = form.subjects.filter((subject) => subject.isActive).length;
  const totalMaxScore = form.subjects.reduce((sum, subject) => subject.isActive ? sum + (calculateMaxScore(subject.totalItems, subject.pointsPerItem) ?? 0) : sum, 0);

  if (!isReady) {
    return <ExamTypeManagerSkeleton />;
  }

  function resetForm() {
    setSelectedId(null);
    setEditingId(null);
    setCopySourceId(null);
    setForm(createDefaultForm());
  }

  function selectExamType(examType: ExamTypeItem) {
    setSelectedId(examType.id);
    setEditingId(examType.id);
    setCopySourceId(null);
    setForm(toFormState(examType));
  }

  function startCopy(examType: ExamTypeItem) {
    setSelectedId(examType.id);
    setEditingId(null);
    setCopySourceId(examType.id);
    setForm(toCopyFormState(examType));
  }

  function updateSubject(localId: string, updater: (subject: SubjectFormItem) => SubjectFormItem) {
    setForm((current) => ({
      ...current,
      subjects: current.subjects.map((subject) => subject.localId === localId ? updater(subject) : subject),
    }));
  }

  async function refreshExamTypes(showToast = false) {
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/${divisionSlug}/exam-types`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "시험 템플릿 목록을 불러오지 못했습니다.");
      const nextExamTypes = (data.examTypes as ExamTypeItem[]) ?? [];
      setExamTypes(nextExamTypes);
      if (editingId) {
        const matched = nextExamTypes.find((item) => item.id === editingId);
        if (matched) {
          setSelectedId(matched.id);
          setForm(toFormState(matched));
        }
      }
      if (showToast) toast.success("시험 템플릿 목록을 새로 불러왔습니다.");
      return nextExamTypes;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "시험 템플릿 목록을 불러오지 못했습니다.");
      return null;
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const isCopyMode = !editingId && Boolean(copySourceId);
      const response = await fetch(editingId ? `/api/${divisionSlug}/exam-types/${editingId}` : `/api/${divisionSlug}/exam-types`, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequestBody(form)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "시험 템플릿 저장에 실패했습니다.");
      const savedExamType = data.examType as ExamTypeItem | undefined;
      const nextExamTypes = await refreshExamTypes();
      if (savedExamType) {
        const matched = nextExamTypes?.find((item) => item.id === savedExamType.id) ?? savedExamType;
        setSelectedId(matched.id);
        setEditingId(matched.id);
        setCopySourceId(null);
        setForm(toFormState(matched));
      }
      toast.success(editingId ? "시험 템플릿을 수정했습니다." : isCopyMode ? "시험 템플릿을 복사했습니다." : "시험 템플릿을 추가했습니다.");
      showActionComplete({
        title: editingId
          ? "시험 템플릿 수정 완료"
          : isCopyMode
            ? "시험 템플릿 복사 완료"
            : "시험 템플릿 추가 완료",
        description: editingId
          ? "시험 템플릿 변경 사항이 저장되었습니다."
          : isCopyMode
            ? "기존 템플릿을 기반으로 새 시험 템플릿을 만들었습니다."
            : "새 시험 템플릿을 등록했습니다.",
        notice: "시험 템플릿 변경 사항은 성적 입력과 시험 설정 화면에 바로 반영됩니다.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "시험 템플릿 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(examTypeId: string) {
    const confirmed = await confirm({
      title: "시험 템플릿 삭제",
      description: "이 시험 템플릿을 삭제하시겠습니까? 성적 데이터가 연결된 템플릿은 삭제되지 않습니다.",
      confirmLabel: "삭제",
      cancelLabel: "취소",
      variant: "danger",
    });
    if (!confirmed) return;
    setDeletingId(examTypeId);
    try {
      const response = await fetch(`/api/${divisionSlug}/exam-types/${examTypeId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "시험 템플릿 삭제에 실패했습니다.");
      toast.success("시험 템플릿을 삭제했습니다.");
      showActionComplete({
        title: "시험 템플릿 삭제 완료",
        description: "시험 템플릿을 삭제했습니다.",
        notice: "삭제된 템플릿은 시험 설정과 성적 입력 화면에서 더 이상 표시되지 않습니다.",
      });
      const nextExamTypes = await refreshExamTypes();
      if (selectedId === examTypeId || editingId === examTypeId || copySourceId === examTypeId) {
        const fallback = nextExamTypes?.[0];
        if (fallback) selectExamType(fallback);
        else resetForm();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "시험 템플릿 삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const previous = orderedExamTypes;
    const oldIndex = orderedExamTypes.findIndex((item) => item.id === active.id);
    const newIndex = orderedExamTypes.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(orderedExamTypes, oldIndex, newIndex).map((item, index) => ({ ...item, displayOrder: index }));
    setExamTypes(reordered);
    try {
      const response = await fetch(`/api/${divisionSlug}/exam-types/${String(active.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reorderIds: reordered.map((item) => item.id) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "시험 템플릿 순서 변경에 실패했습니다.");
      setExamTypes(data.examTypes as ExamTypeItem[]);
      toast.success("시험 템플릿 순서를 변경했습니다.");
    } catch (error) {
      setExamTypes(previous);
      toast.error(error instanceof Error ? error.message : "시험 템플릿 순서 변경에 실패했습니다.");
    }
  }

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <section className="rounded-[10px] border border-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">시험 템플릿</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">시험 템플릿 목록</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">드래그로 템플릿 순서를 바꾸고, 복사, 수정, 활성 상태를 함께 관리할 수 있습니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void refreshExamTypes(true)} disabled={isRefreshing} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">{isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}새로고침</button>
            <button type="button" onClick={resetForm} className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"><Plus className="h-4 w-4" />새 템플릿</button>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {orderedExamTypes.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={orderedExamTypes.map((examType) => examType.id)} strategy={verticalListSortingStrategy}>
                {orderedExamTypes.map((examType) => (
                  <SortableExamTypeCard
                    key={examType.id}
                    examType={examType}
                    isSelected={selectedId === examType.id}
                    isDeleting={deletingId === examType.id}
                    isCopySource={copySourceId === examType.id}
                    onSelect={selectExamType}
                    onCopy={startCopy}
                    onDelete={(id) => void handleDelete(id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            <div className="rounded-[12px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">등록된 시험 템플릿이 없습니다. 새 템플릿을 추가해 주세요.</div>
          )}
        </div>
      </section>

      <section className="rounded-[10px] border border-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">템플릿 편집</p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">{editingId ? "시험 템플릿 수정" : copySourceId ? "시험 템플릿 복사" : "새 시험 템플릿"}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">{copySourceName ? `${copySourceName}: 원본 설정을 그대로 가져왔습니다. 필요한 항목만 수정 후 저장하면 새 템플릿으로 추가됩니다.` : editingId ? "직렬별 시험 종류와 과목 구성을 수정합니다." : "직렬별 시험 종류와 과목별 배점을 새로 등록합니다."}</p>
          </div>
          {(editingId || copySourceId || form.name.trim()) ? <button type="button" onClick={resetForm} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">초기화</button> : null}
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[12px] border border-slate-200 px-4 py-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">직렬</p><p className="mt-3 text-2xl font-bold text-slate-950">{getTrackLabel(form.studyTrack === COMMON_TRACK_VALUE ? null : form.studyTrack)}</p></div>
            <div className="rounded-[12px] border border-slate-200 px-4 py-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">과목 수</p><p className="mt-3 text-2xl font-bold text-slate-950">{activeSubjectCount}개</p></div>
            <div className="rounded-[12px] border border-slate-200 px-4 py-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">예상 총점</p><p className="mt-3 text-2xl font-bold text-slate-950">{totalMaxScore > 0 ? `${totalMaxScore}점` : "미설정"}</p></div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {[{ value: "MORNING" as const, label: "아침모의고사", description: "매일 과목별 입력, 주간 집계" }, { value: "REGULAR" as const, label: "정기모의고사", description: "회차별 한 번에 입력, 누적 관리" }].map((option) => (
              <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-[12px] border px-4 py-4 ${form.category === option.value ? "border-amber-300 bg-amber-50" : "border-slate-200 hover:bg-slate-50"}`}>
                <input type="radio" name="exam-category" checked={form.category === option.value} onChange={() => setForm((current) => ({ ...current, category: option.value }))} className="mt-1 h-4 w-4 border-slate-300 text-[var(--division-color)]" />
                <span><span className="block text-sm font-semibold text-slate-900">{option.label}</span><span className="mt-1 block text-xs text-slate-500">{option.description}</span></span>
              </label>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-800">시험 종류명</span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="(공채) 아침 모의고사" className="w-full rounded-[12px] border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--division-color)]" /></label>
            <label className="block"><span className="mb-2 block text-sm font-semibold text-slate-800">대상 직렬</span><select value={form.studyTrack} onChange={(event) => setForm((current) => ({ ...current, studyTrack: event.target.value }))} className="w-full rounded-[12px] border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--division-color)]"><option value={COMMON_TRACK_VALUE}>공통</option>{trackOptions.map((track) => <option key={track} value={track}>{track}</option>)}</select></label>
          </div>

          <label className="flex items-center gap-3 rounded-[12px] border border-slate-200 px-4 py-3"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-[var(--division-color)]" /><span className="text-sm font-medium text-slate-800">활성 상태</span></label>

          <div className="rounded-[12px] border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4"><div><p className="text-lg font-bold text-slate-950">과목 구성</p><p className="mt-1 text-sm text-slate-500">과목명, 문항 수, 배점을 설정합니다.</p></div><button type="button" onClick={() => setForm((current) => ({ ...current, subjects: [...current.subjects, createSubject()] }))} className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"><Plus className="h-4 w-4" />과목 추가</button></div>
            <div className="space-y-3 p-4">
              {form.subjects.map((subject, index) => {
                const maxScore = calculateMaxScore(subject.totalItems, subject.pointsPerItem);
                return (
                  <div key={subject.localId} className="rounded-[12px] border border-slate-200 px-4 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">과목 {index + 1}</p>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={subject.isActive} onChange={(event) => setForm((current) => ({ ...current, subjects: current.subjects.map((item) => item.localId === subject.localId ? { ...item, isActive: event.target.checked } : item) }))} className="h-4 w-4 rounded border-slate-300 text-[var(--division-color)]" />활성</label>
                        <button type="button" onClick={() => setForm((current) => ({ ...current, subjects: current.subjects.length > 1 ? current.subjects.filter((item) => item.localId !== subject.localId) : current.subjects }))} disabled={form.subjects.length <= 1} className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-200 text-rose-600 transition hover:bg-rose-50 disabled:opacity-50" aria-label="과목 삭제"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
                      <input value={subject.name} onChange={(event) => updateSubject(subject.localId, (current) => ({ ...current, name: event.target.value }))} placeholder="과목명" className="w-full rounded-[12px] border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--division-color)]" />
                      <input inputMode="numeric" value={subject.totalItems} onChange={(event) => updateSubject(subject.localId, (current) => ({ ...current, totalItems: event.target.value }))} placeholder="문항 수" className="w-full rounded-[12px] border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--division-color)]" />
                      <input inputMode="decimal" value={subject.pointsPerItem} onChange={(event) => updateSubject(subject.localId, (current) => ({ ...current, pointsPerItem: event.target.value }))} placeholder="배점" className="w-full rounded-[12px] border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[var(--division-color)]" />
                      <div className="rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">예상 점수 {maxScore === null ? "-" : `${maxScore}점`}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3"><button type="button" onClick={resetForm} className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">취소</button><button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">{isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{editingId ? "시험 템플릿 저장" : copySourceId ? "복사본 저장" : "시험 템플릿 추가"}</button></div>
        </form>
      </section>
      </div>
      {confirmDialog}
      {actionCompleteModal}
    </>
  );
}
