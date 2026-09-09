"use client";

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, LoaderCircle, Pencil, Plus, RefreshCcw, Save, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/sonner";

import { useActionCompleteModal } from "@/components/ui/useActionCompleteModal";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import { getGroupedFullScore } from "@/lib/exam-full-score";
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
  alternateGroup: string;
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
  return { localId, alternateGroup: "", name: "", totalItems: "20", pointsPerItem: "5", isActive: true };
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
          alternateGroup: subject.alternateGroup ?? "",
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
          alternateGroup: subject.alternateGroup ?? "",
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
      alternateGroup: subject.alternateGroup.trim() || null,
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
  const totalMaxScore = getGroupedFullScore(activeSubjects);
  return {
    subjectNames: activeSubjects.map((subject) => subject.name).join(", ") || "활성 과목이 없습니다.",
    activeSubjectCount: activeSubjects.length,
    totalMaxScore: totalMaxScore > 0 ? totalMaxScore : null,
  };
}

/* 자리표시자는 실제 상자를 그대로 흉내 내지 않는다 (DESIGN.md 5.7).
   목록 줄과 폼 줄의 자리만 잡아 두면 로딩 중에만 다른 구조가 보이는 일이 없다. */
function ExamTypeManagerSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      <section className="admin-section" aria-hidden="true">
        <div className="admin-workspace-toolbar">
          <div className="admin-skeleton h-6 w-40" />
          <div className="flex gap-2">
            <div className="admin-skeleton h-11 w-28" />
            <div className="admin-skeleton h-11 w-28" />
          </div>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="admin-skeleton h-[92px] w-full" />
          ))}
        </div>
      </section>

      <section className="admin-section" aria-hidden="true">
        <div className="admin-skeleton h-6 w-32" />
        <div className="admin-metric-strip">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="admin-skeleton h-[76px]" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="admin-skeleton h-[72px]" />
          ))}
        </div>
        <div className="admin-skeleton h-[240px] w-full" />
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

  /* DESIGN.md 5.6 — 제목·보조설명이 여러 줄인 목록 선택은 .admin-choice-card 다.
     선택을 직렬색 전면 반전으로 표시하면 카드 안 글자·배지 색을 전부 다시 정해야 하고,
     선택된 줄만 다른 화면처럼 보인다. accent 테두리 + accent-soft 배경으로 둔다.
     카드 안에 드래그·수정·복사·삭제 버튼이 들어가므로 카드 자체는 button 이 아니라
     data-active 를 갖는 컨테이너이고, 선택은 제목 버튼의 aria-pressed 가 알린다. */
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="admin-choice-card"
      data-active={isSelected}
      data-dragging={isDragging}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="admin-button admin-icon-button shrink-0 cursor-grab touch-none active:cursor-grabbing"
          aria-label="시험 템플릿 순서 이동"
          title="시험 템플릿 순서 이동"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button
          type="button"
          aria-pressed={isSelected}
          onClick={() => onSelect(examType)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="admin-choice-card-title block">{examType.name}</span>

          <span className="mt-2 flex flex-wrap items-center gap-2">
            <span className="admin-badge">{getCategoryLabel(examType.category)}</span>
            <span className="admin-badge">직렬 {getTrackLabel(examType.studyTrack)}</span>
            {isCopySource ? (
              <span className="admin-badge border-[var(--admin-accent-line)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent)]">복사 기준</span>
            ) : null}
            <span className="admin-badge">순서 {examType.displayOrder + 1}</span>
            <span
              className={`admin-badge ${examType.isActive
                ? "border-[var(--admin-success-line)] bg-[var(--admin-success-soft)] text-[var(--admin-success)]"
                : "border-[var(--admin-danger-line)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]"}`}
            >
              {examType.isActive ? "활성" : "비활성"}
            </span>
          </span>

          <span className="admin-help mt-2 block">{summary.subjectNames}</span>
          <span className="admin-help mt-1 block">
            과목 수 {summary.activeSubjectCount}개{summary.totalMaxScore ? ` · 예상 총점 ${summary.totalMaxScore}점` : ""}
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => onSelect(examType)} className="admin-button admin-icon-button" aria-label="시험 템플릿 수정" title="시험 템플릿 수정">
            <Pencil className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onCopy(examType)} className="admin-button">
            <Copy className="h-4 w-4" />
            복사
          </button>
          <button type="button" onClick={() => onDelete(examType.id)} disabled={isDeleting} className="admin-button admin-button-danger-outline admin-icon-button" aria-label="시험 템플릿 삭제" title="시험 템플릿 삭제">
            {isDeleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
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
  const totalMaxScore = getGroupedFullScore(buildRequestBody(form).subjects);

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
      <section className="admin-section">
        <div className="admin-workspace-toolbar">
          <h2 className="admin-section-title">시험 템플릿 목록</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void refreshExamTypes(true)} disabled={isRefreshing} className="admin-button">{isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}새로고침</button>
            <button type="button" onClick={resetForm} className="admin-button admin-button-primary"><Plus className="h-4 w-4" />새 템플릿</button>
          </div>
        </div>
        <p className="admin-help">드래그로 순서를 바꾸고, 이름을 눌러 수정할 템플릿을 고릅니다.</p>

        <div className="space-y-3">
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
            <p className="admin-empty-state">등록된 시험 템플릿이 없습니다. 새 템플릿을 추가해 주세요.</p>
          )}
        </div>
      </section>

      <section className="admin-section">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="admin-section-title">{editingId ? "시험 템플릿 수정" : copySourceId ? "시험 템플릿 복사" : "새 시험 템플릿"}</h2>
            <p className="admin-help mt-3 leading-6">{copySourceName ? `${copySourceName}: 원본 설정을 그대로 가져왔습니다. 필요한 항목만 수정 후 저장하면 새 템플릿으로 추가됩니다.` : editingId ? "직렬별 시험 종류와 과목 구성을 수정합니다." : "직렬별 시험 종류와 과목별 배점을 새로 등록합니다."}</p>
          </div>
          {(editingId || copySourceId || form.name.trim()) ? <button type="button" onClick={resetForm} className="admin-button">초기화</button> : null}
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-5">
          <div className="admin-metric-strip">
            <div className="admin-metric-box"><p className="admin-metric-box-label">직렬</p><p className="admin-metric-box-value">{getTrackLabel(form.studyTrack === COMMON_TRACK_VALUE ? null : form.studyTrack)}</p></div>
            <div className="admin-metric-box"><p className="admin-metric-box-label">과목 수</p><p className="admin-metric-box-value">{activeSubjectCount}개</p></div>
            <div className="admin-metric-box"><p className="admin-metric-box-label">예상 총점</p><p className="admin-metric-box-value">{totalMaxScore > 0 ? `${totalMaxScore}점` : "미설정"}</p></div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {[{ value: "MORNING" as const, label: "아침모의고사", description: "매일 과목별 입력, 주간 집계" }, { value: "REGULAR" as const, label: "정기모의고사", description: "회차별 한 번에 입력, 누적 관리" }].map((option) => (
              <label key={option.value} className="admin-choice-card cursor-pointer" data-active={form.category === option.value}>
                <span className="flex items-start gap-3">
                  <input type="radio" name="exam-category" checked={form.category === option.value} onChange={() => setForm((current) => ({ ...current, category: option.value }))} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="admin-choice-card-title block">{option.label}</span>
                    <span className="admin-help mt-1 block">{option.description}</span>
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block"><span className="admin-label mb-2 block">시험 종류명</span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="(공채) 아침 모의고사" className="w-full" /></label>
            <label className="block"><span className="admin-label mb-2 block">대상 직렬</span><select value={form.studyTrack} onChange={(event) => setForm((current) => ({ ...current, studyTrack: event.target.value }))} className="w-full"><option value={COMMON_TRACK_VALUE}>공통</option>{trackOptions.map((track) => <option key={track} value={track}>{track}</option>)}</select></label>
          </div>

          <label className="admin-panel-row"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /><span className="admin-label">활성 상태</span></label>

          {/* DESIGN.md 5.3 — 제목줄과 본문이 나뉘는 묶음은 .admin-panel 이다.
              .admin-section 에 직접 헤더 선을 그으면 화면마다 다른 패널이 생긴다. */}
          <div className="admin-panel">
            <div className="admin-panel-header"><div><h3 className="admin-section-title">과목 구성</h3><p className="admin-help mt-1">같은 택1 그룹은 가장 큰 만점 하나만 총점에 더합니다.</p></div><button type="button" onClick={() => setForm((current) => ({ ...current, subjects: [...current.subjects, createSubject()] }))} className="admin-button"><Plus className="h-4 w-4" />과목 추가</button></div>
            <div className="divide-y divide-[var(--admin-line-soft)]">
              {form.subjects.map((subject, index) => {
                const maxScore = calculateMaxScore(subject.totalItems, subject.pointsPerItem);
                return (
                  <div key={subject.localId} className="space-y-3 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="admin-label">과목 {index + 1}</p>
                      <div className="flex items-center gap-2">
                        <label className="admin-label flex items-center gap-2"><input type="checkbox" checked={subject.isActive} onChange={(event) => setForm((current) => ({ ...current, subjects: current.subjects.map((item) => item.localId === subject.localId ? { ...item, isActive: event.target.checked } : item) }))} />활성</label>
                        <button type="button" onClick={() => setForm((current) => ({ ...current, subjects: current.subjects.length > 1 ? current.subjects.filter((item) => item.localId !== subject.localId) : current.subjects }))} disabled={form.subjects.length <= 1} className="admin-button admin-button-compact admin-button-danger-outline w-11 px-0" aria-label="과목 삭제"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    {/* 5.7 — placeholder 는 값을 넣으면 사라진다. 칸 이름은 라벨로 둔다. */}
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
                      <label className="admin-label">과목명
                        <input value={subject.name} onChange={(event) => updateSubject(subject.localId, (current) => ({ ...current, name: event.target.value }))} placeholder="예: 헌법" />
                      </label>
                      <label className="admin-label">문항 수
                        <input inputMode="numeric" value={subject.totalItems} onChange={(event) => updateSubject(subject.localId, (current) => ({ ...current, totalItems: event.target.value }))} />
                      </label>
                      <label className="admin-label">문항당 배점
                        <input inputMode="decimal" value={subject.pointsPerItem} onChange={(event) => updateSubject(subject.localId, (current) => ({ ...current, pointsPerItem: event.target.value }))} />
                      </label>
                      <div>
                        <span className="admin-label">예상 만점</span>
                        <p className="mt-2 font-semibold">{maxScore === null ? "-" : `${maxScore}점`}</p>
                      </div>
                    </div>
                    <label className="admin-label block">택1 그룹
                      <input maxLength={80} value={subject.alternateGroup}
                        onChange={(event) => updateSubject(subject.localId, (current) => ({ ...current, alternateGroup: event.target.value }))}
                        placeholder="택1 과목끼리 같은 그룹명 입력" />
                      <span className="admin-help mt-2 block">필수 과목은 비워 두세요.</span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3"><button type="button" onClick={resetForm} className="admin-button">취소</button><button type="submit" disabled={isSaving} className="admin-button admin-button-primary">{isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{editingId ? "시험 템플릿 저장" : copySourceId ? "복사본 저장" : "시험 템플릿 추가"}</button></div>
        </form>
      </section>
      </div>
      {confirmDialog}
      {actionCompleteModal}
    </>
  );
}
