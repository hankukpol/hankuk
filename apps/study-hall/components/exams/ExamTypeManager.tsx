"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, LoaderCircle, Plus, RefreshCcw, Save, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useId, useMemo, useState } from "react";
import { toast } from "@/lib/sonner";

import { useActionCompleteModal } from "@/components/ui/useActionCompleteModal";
import { useConfigurationReview } from "@/components/settings/ConfigurationReview";
import { editAcademyExam } from "@/lib/academy-exam-edit";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import { DialogActions } from "@/components/ui/DialogActions";
import { SlideOver } from "@/components/ui/SlideOver";
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
    <div className="space-y-6">
      <div className="admin-skeleton h-11 w-full max-w-sm" aria-hidden="true" />
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
    </div>
  );
}

function SortableExamTypeCard({
  examType,
  isDeleting,
  onSelect,
  onCopy,
  onDelete,
}: {
  examType: ExamTypeItem;
  isDeleting: boolean;
  onSelect: (examType: ExamTypeItem) => void;
  onCopy: (examType: ExamTypeItem) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: examType.id });
  const summary = summarizeExamType(examType);


  return (
    <tr ref={setNodeRef} style={{ transform: transform ? CSS.Transform.toString(transform) : undefined, transition }} data-dragging={isDragging}>
      <td><button type="button" className="admin-button admin-icon-button cursor-grab touch-none" aria-label={examType.name + " 순서 이동"} title="시험 템플릿 순서 이동" {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button></td>
      <td className="admin-table-name"><button type="button" className="admin-table-link" onClick={() => onSelect(examType)}>{examType.name}</button><span className="admin-help block">{summary.subjectNames}</span><span className="admin-help block md:hidden">{getCategoryLabel(examType.category)} · {getTrackLabel(examType.studyTrack)} · {examType.isActive ? "활성" : "비활성"}</span></td>
      <td className="hidden md:table-cell">{getCategoryLabel(examType.category)}</td>
      <td className="hidden md:table-cell">{getTrackLabel(examType.studyTrack)}</td>
      <td className="admin-table-amount">{summary.totalMaxScore ?? "-"}<span className="admin-help block">{summary.activeSubjectCount}과목</span></td>
      <td className="hidden md:table-cell"><span className={examType.isActive ? "text-admin-success" : "text-admin-text-muted"}>{examType.isActive ? "활성" : "비활성"}</span></td>
      <td><div className="flex flex-wrap justify-center gap-1"><button type="button" onClick={() => onCopy(examType)} className="admin-button admin-icon-button" aria-label={examType.name + " 복사"} title="템플릿 복사"><Copy className="h-4 w-4" /></button><button type="button" onClick={() => onDelete(examType.id)} disabled={isDeleting} className="admin-button admin-icon-button admin-button-danger-outline hidden md:inline-flex" aria-label={examType.name + " 삭제"} title="템플릿 삭제">{isDeleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button></div></td>
    </tr>
  );
}

export function ExamTypeManager({ divisionSlug, initialExamTypes, studyTrackOptions }: Props) {
  const [isReady, setIsReady] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const [examTypes, setExamTypes] = useState(initialExamTypes);
  const [selectedId, setSelectedId] = useState<string | null>(initialExamTypes[0]?.id ?? null);
  const [editingId, setEditingId] = useState<string | null>(initialExamTypes[0]?.id ?? null);
  const [copySourceId, setCopySourceId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => initialExamTypes[0] ? toFormState(initialExamTypes[0]) : createDefaultForm());
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [initialForm, setInitialForm] = useState<FormState>(createDefaultForm);
  const formId = useId();
  const { showActionComplete, actionCompleteModal } = useActionCompleteModal();
  const {review,dialog}=useConfigurationReview(divisionSlug);
  const {confirm,confirmDialog}=useConfirmDialog();

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
    const nextForm = createDefaultForm();
    setForm(nextForm); setInitialForm(nextForm);
    setEditorOpen(true);
  }

  function selectExamType(examType: ExamTypeItem) {
    setSelectedId(examType.id);
    setEditingId(examType.id);
    setCopySourceId(null);
    const nextForm = toFormState(examType);
    setForm(nextForm); setInitialForm(nextForm);
    setEditorOpen(true);
  }

  function startCopy(examType: ExamTypeItem) {
    setSelectedId(examType.id);
    setEditingId(null);
    setCopySourceId(examType.id);
    const nextForm = toCopyFormState(examType);
    setForm(nextForm); setInitialForm(nextForm);
    setEditorOpen(true);
  }

  async function closeEditor() {
    if (isSaving || deletingId) return;
    if (JSON.stringify(form) !== JSON.stringify(initialForm) && !await confirm({
      title: "변경사항 폐기", description: "저장하지 않은 시험 템플릿 변경사항이 있습니다.", confirmLabel: "변경 폐기", cancelLabel: "계속 편집", variant: "warning",
    })) return;
    setEditorOpen(false);
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
    if (isSaving) return;
    setIsSaving(true);
    try {
      const isCopyMode = !editingId && Boolean(copySourceId);
      const result=await review("시험 설정 변경",current=>editAcademyExam(current,editingId,buildRequestBody(form)));
      if(result?.status!=="APPLIED"){if(result?.status==="PENDING")setEditorOpen(false);return;}
      const nextExamTypes = await refreshExamTypes();
      const savedExamType=nextExamTypes?.find(e=>editingId?e.id===editingId:e.name===form.name.trim()&&e.category===form.category);
      if (savedExamType) {
        const matched = nextExamTypes?.find((item) => item.id === savedExamType.id) ?? savedExamType;
        setSelectedId(matched.id);
        setEditingId(matched.id);
        setCopySourceId(null);
        setForm(toFormState(matched));
      }
      setEditorOpen(false);
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
    setDeletingId(examTypeId);
    try {
      const result=await review("시험 종류 비활성화",current=>({...current,examTypes:current.examTypes.map(e=>e.id===examTypeId?{...e,isActive:false}:e)}));
      if(result?.status!=="APPLIED"){if(result?.status==="PENDING")setEditorOpen(false);return;}
      toast.success("기존 성적을 보존하고 시험 종류를 비활성화했습니다.");
      const nextExamTypes = await refreshExamTypes();
      if (selectedId === examTypeId || editingId === examTypeId || copySourceId === examTypeId) {
        const fallback = nextExamTypes?.[0];
        if (fallback) selectExamType(fallback);
        else resetForm();
        setEditorOpen(false);
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
      <section className="admin-section">
        <div className="admin-workspace-toolbar">
          <h2 className="admin-section-title">시험 템플릿 목록</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void refreshExamTypes(true)} disabled={isRefreshing} className="admin-button">{isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}새로고침</button>
            <button type="button" onClick={resetForm} className="admin-button admin-button-primary"><Plus className="h-4 w-4" />새 템플릿</button>
          </div>
        </div>
        <p className="admin-help">전체 {orderedExamTypes.length}개</p>

        <div className="space-y-3">
          {orderedExamTypes.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={orderedExamTypes.map((examType) => examType.id)} strategy={verticalListSortingStrategy}>
                <div className="admin-table-frame"><table aria-label="시험 템플릿 목록"><thead><tr><th scope="col">순서</th><th scope="col">템플릿</th><th scope="col" className="hidden md:table-cell">유형</th><th scope="col" className="hidden md:table-cell">직렬</th><th scope="col">총점</th><th scope="col" className="hidden md:table-cell">상태</th><th scope="col">관리</th></tr></thead><tbody>
                {orderedExamTypes.map((examType) => (
                  <SortableExamTypeCard
                    key={examType.id}
                    examType={examType}
                    isDeleting={deletingId === examType.id}
                    onSelect={selectExamType}
                    onCopy={startCopy}
                    onDelete={(id) => void handleDelete(id)}
                  />
                ))}
                </tbody></table></div>
              </SortableContext>
            </DndContext>
          ) : (
            <p className="admin-empty-state">등록된 시험 템플릿이 없습니다. 새 템플릿을 추가해 주세요.</p>
          )}
        </div>
      </section>
      <SlideOver open={editorOpen} title={editingId ? "시험 템플릿 수정" : copySourceId ? "시험 템플릿 복사" : "새 시험 템플릿"} description={copySourceName ? "복사 기준: " + copySourceName : undefined} onClose={() => void closeEditor()}>
        <form id={formId} onSubmit={handleSubmit} className="space-y-5">
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

          <DialogActions>{editingId ? <button type="button" disabled={isSaving || Boolean(deletingId)} onClick={() => void handleDelete(editingId)} className="admin-button admin-button-danger-outline mr-auto"><Trash2 className="h-4 w-4" />삭제</button> : null}<button type="button" disabled={isSaving} onClick={() => void closeEditor()} className="admin-button">취소</button><button type="submit" form={formId} disabled={isSaving} className="admin-button admin-button-primary">{isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{editingId ? "시험 템플릿 저장" : copySourceId ? "복사본 저장" : "시험 템플릿 추가"}</button></DialogActions>
        </form>
      </SlideOver>
      {confirmDialog}{dialog}
      {actionCompleteModal}
    </>
  );
}
