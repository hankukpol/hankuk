"use client";

import { LoaderCircle, Pencil, Plus, RefreshCcw, Save, Trash2 } from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";

import type { ExamTypeItem } from "@/lib/services/exam.service";

type ExamTypeManagerProps = {
  divisionSlug: string;
  initialExamTypes: ExamTypeItem[];
  studyTrackOptions: string[];
};

type SubjectFormItem = {
  id?: string;
  localId: string;
  name: string;
  totalItems: string;
  pointsPerItem: string;
  isActive: boolean;
};

type ExamCategoryValue = "MORNING" | "REGULAR";

type FormState = {
  name: string;
  category: ExamCategoryValue;
  studyTrack: string;
  isActive: boolean;
  subjects: SubjectFormItem[];
};

const COMMON_TRACK_VALUE = "__COMMON__";

const defaultForm: FormState = {
  name: "",
  category: "REGULAR",
  studyTrack: COMMON_TRACK_VALUE,
  isActive: true,
  subjects: [
    {
      localId: "subject-0",
      name: "",
      totalItems: "20",
      pointsPerItem: "5",
      isActive: true,
    },
  ],
};

function formatTrackLabel(studyTrack: string | null) {
  return studyTrack || "공통";
}

function buildTrackOptions(examTypes: ExamTypeItem[], studyTrackOptions: string[]) {
  return Array.from(
    new Set([
      ...studyTrackOptions,
      ...examTypes.map((examType) => examType.studyTrack).filter((track): track is string => Boolean(track)),
    ]),
  );
}

function toFormState(examType: ExamTypeItem): FormState {
  return {
    name: examType.name,
    category: examType.category === "MORNING" ? "MORNING" : "REGULAR",
    studyTrack: examType.studyTrack ?? COMMON_TRACK_VALUE,
    isActive: examType.isActive,
    subjects: examType.subjects.map((subject) => ({
      id: subject.id,
      localId: subject.id,
      name: subject.name,
      totalItems: subject.totalItems?.toString() ?? "",
      pointsPerItem: subject.pointsPerItem?.toString() ?? "",
      isActive: subject.isActive,
    })),
  };
}

function calculateMaxScore(totalItems: string, pointsPerItem: string) {
  const questionCount = Number(totalItems.trim());
  const scorePerQuestion = Number(pointsPerItem.trim());

  if (!Number.isFinite(questionCount) || !Number.isFinite(scorePerQuestion)) {
    return null;
  }

  return questionCount * scorePerQuestion;
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

function summarizeExamType(examType: ExamTypeItem) {
  const activeSubjects = examType.subjects.filter((subject) => subject.isActive);
  const totalMaxScore = activeSubjects.reduce((sum, subject) => sum + (subject.maxScore ?? 0), 0);

  return {
    activeSubjectCount: activeSubjects.length,
    totalMaxScore: totalMaxScore > 0 ? totalMaxScore : null,
  };
}

export function ExamTypeManager({
  divisionSlug,
  initialExamTypes,
  studyTrackOptions,
}: ExamTypeManagerProps) {
  const [examTypes, setExamTypes] = useState(initialExamTypes);
  const [selectedId, setSelectedId] = useState<string | null>(initialExamTypes[0]?.id ?? null);
  const [editingId, setEditingId] = useState<string | null>(initialExamTypes[0]?.id ?? null);
  const [form, setForm] = useState<FormState>(
    initialExamTypes[0] ? toFormState(initialExamTypes[0]) : defaultForm,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const orderedExamTypes = useMemo(
    () => [...examTypes].sort((left, right) => left.displayOrder - right.displayOrder),
    [examTypes],
  );

  const trackOptions = useMemo(
    () => buildTrackOptions([...initialExamTypes, ...examTypes], studyTrackOptions),
    [examTypes, initialExamTypes, studyTrackOptions],
  );

  function resetForm() {
    setEditingId(null);
    setSelectedId(null);
    setForm(defaultForm);
  }

  function selectExamType(examType: ExamTypeItem) {
    setSelectedId(examType.id);
    setEditingId(examType.id);
    setForm(toFormState(examType));
  }

  function updateSubject(localId: string, updater: (current: SubjectFormItem) => SubjectFormItem) {
    setForm((current) => ({
      ...current,
      subjects: current.subjects.map((subject) =>
        subject.localId === localId ? updater(subject) : subject,
      ),
    }));
  }

  function appendSubject() {
    setForm((current) => ({
      ...current,
      subjects: [
        ...current.subjects,
        {
          localId: `subject-${Date.now()}`,
          name: "",
          totalItems: "20",
          pointsPerItem: "5",
          isActive: true,
        },
      ],
    }));
  }

  function removeSubject(localId: string) {
    setForm((current) => {
      const nextSubjects = current.subjects.filter((subject) => subject.localId !== localId);
      return {
        ...current,
        subjects: nextSubjects.length > 0 ? nextSubjects : current.subjects,
      };
    });
  }

  async function refreshExamTypes(showToast = false) {
    setIsRefreshing(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/exam-types`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "시험 종류 목록을 불러오지 못했습니다.");
      }

      setExamTypes(data.examTypes);

      if (editingId) {
        const matched = data.examTypes.find((examType: ExamTypeItem) => examType.id === editingId);

        if (matched) {
          setForm(toFormState(matched));
          setSelectedId(matched.id);
        }
      }

      if (showToast) {
        toast.success("시험 템플릿을 새로 불러왔습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "시험 종류 목록을 불러오지 못했습니다.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const endpoint = editingId
        ? `/api/${divisionSlug}/exam-types/${editingId}`
        : `/api/${divisionSlug}/exam-types`;
      const method = editingId ? "PATCH" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildRequestBody(form)),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "시험 템플릿 저장에 실패했습니다.");
      }

      toast.success(editingId ? "시험 템플릿을 수정했습니다." : "시험 템플릿을 추가했습니다.");
      await refreshExamTypes();

      if (!editingId) {
        setEditingId(data.examType.id);
        setSelectedId(data.examType.id);
        setForm(toFormState(data.examType));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "시험 템플릿 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("이 시험 템플릿과 관련 성적 기록을 삭제하시겠습니까?")) {
      return;
    }

    setDeletingId(id);

    try {
      const response = await fetch(`/api/${divisionSlug}/exam-types/${id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "시험 템플릿 삭제에 실패했습니다.");
      }

      toast.success("시험 템플릿을 삭제했습니다.");
      const remaining = orderedExamTypes.filter((examType) => examType.id !== id);
      setExamTypes(remaining);

      if (editingId === id) {
        if (remaining[0]) {
          selectExamType(remaining[0]);
        } else {
          resetForm();
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "시험 템플릿 삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  const previewSubjectCount = form.subjects.filter((subject) => subject.isActive).length;
  const previewMaxScore = form.subjects.reduce((sum, subject) => {
    if (!subject.isActive) {
      return sum;
    }

    return sum + (calculateMaxScore(subject.totalItems, subject.pointsPerItem) ?? 0);
  }, 0);

  return (
    <div className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
      <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              시험 템플릿
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">시험 템플릿 목록</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshExamTypes(true)}
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
              <Plus className="h-4 w-4" />새 템플릿
            </button>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {orderedExamTypes.length > 0 ? (
            orderedExamTypes.map((examType) => {
              const summary = summarizeExamType(examType);

              return (
                <article
                  key={examType.id}
                  className={`rounded-[10px] border px-4 py-4 transition ${
                    selectedId === examType.id
                      ? "border-[var(--division-color)] bg-[var(--division-color)] text-white"
                      : "border-slate-200 bg-white text-slate-950"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => selectExamType(examType)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-bold">{examType.name}</p>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            examType.category === "MORNING"
                              ? selectedId === examType.id
                                ? "bg-amber-300/30 text-white"
                                : "bg-amber-100 text-amber-800"
                              : selectedId === examType.id
                                ? "bg-blue-300/30 text-white"
                                : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {examType.category === "MORNING" ? "아침" : "정기"}
                        </span>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            selectedId === examType.id
                              ? "bg-white/15 text-white"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          직렬 {formatTrackLabel(examType.studyTrack)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            examType.isActive
                              ? selectedId === examType.id
                                ? "bg-white0/20 text-white"
                                : "bg-white border border-slate-200-slate-200 text-emerald-700"
                              : selectedId === examType.id
                                ? "bg-white/15 text-white"
                                : "bg-white border border-slate-200-slate-200 text-rose-700"
                          }`}
                        >
                          {examType.isActive ? "활성" : "비활성"}
                        </span>
                      </div>

                      <p className={`mt-2 text-sm ${selectedId === examType.id ? "text-white/70" : "text-slate-500"}`}>
                        과목 {summary.activeSubjectCount}개
                        {summary.totalMaxScore ? ` · 총점 ${summary.totalMaxScore}점` : ""}
                      </p>
                      <p className={`mt-1 text-sm ${selectedId === examType.id ? "text-white/70" : "text-slate-500"}`}>
                        {examType.subjects
                          .filter((subject) => subject.isActive)
                          .map((subject) => subject.name)
                          .join(", ")}
                      </p>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => selectExamType(examType)}
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-[10px] border transition ${
                          selectedId === examType.id
                            ? "border-white/20 text-white hover:bg-white/10"
                            : "border-slate-200 text-slate-600 hover:bg-white"
                        }`}
                        aria-label="시험 템플릿 수정"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(examType.id)}
                        disabled={deletingId === examType.id}
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-[10px] border transition ${
                          selectedId === examType.id
                            ? "border-white/20 text-white hover:bg-white/10"
                            : "border-slate-200 text-rose-600 hover:bg-white"
                        } disabled:opacity-60`}
                        aria-label="시험 템플릿 삭제"
                      >
                        {deletingId === examType.id ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="rounded-[10px] border border-slate-200-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
              등록된 시험 템플릿이 없습니다. 지점별 운영 방식과 직렬에 맞는 템플릿을 먼저 추가해주세요.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[10px] border border-slate-200-black/5 bg-white p-5 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
          {editingId ? "템플릿 편집" : "템플릿 추가"}
        </p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">
          {editingId ? "시험 템플릿 수정" : "시험 템플릿 추가"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          지점별로 시험 종류를 만들고, 직렬마다 과목명, 과목 수, 문항 수, 문항당 배점을 따로 관리할
          수 있습니다. 여기서 설정한 과목 순서와 배점 안내가 성적 입력 화면에 그대로 반영됩니다.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">직렬</p>
            <p className="mt-3 text-xl font-bold text-slate-950">{formatTrackLabel(form.studyTrack === COMMON_TRACK_VALUE ? null : form.studyTrack)}</p>
          </div>
          <div className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">과목 수</p>
            <p className="mt-3 text-xl font-bold text-slate-950">{previewSubjectCount}개</p>
          </div>
          <div className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">예상 총점</p>
            <p className="mt-3 text-xl font-bold text-slate-950">
              {previewMaxScore > 0 ? `${previewMaxScore}점` : "미설정"}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <span className="mb-2 block text-sm font-medium text-slate-700">시험 분류</span>
            <div className="flex gap-3">
              <label
                className={`flex flex-1 cursor-pointer items-center gap-3 rounded-[10px] border px-4 py-3 transition ${
                  form.category === "MORNING"
                    ? "border-amber-400 bg-amber-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="category"
                  value="MORNING"
                  checked={form.category === "MORNING"}
                  onChange={() =>
                    setForm((current) => ({ ...current, category: "MORNING" }))
                  }
                  disabled={!!editingId}
                  className="h-4 w-4 accent-amber-600"
                />
                <div>
                  <span className="block text-sm font-medium text-slate-800">아침모의고사</span>
                  <span className="block text-xs text-slate-500">매일 1과목씩 입력, 주간 집계</span>
                </div>
              </label>
              <label
                className={`flex flex-1 cursor-pointer items-center gap-3 rounded-[10px] border px-4 py-3 transition ${
                  form.category === "REGULAR"
                    ? "border-blue-400 bg-blue-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="category"
                  value="REGULAR"
                  checked={form.category === "REGULAR"}
                  onChange={() =>
                    setForm((current) => ({ ...current, category: "REGULAR" }))
                  }
                  disabled={!!editingId}
                  className="h-4 w-4 accent-blue-600"
                />
                <div>
                  <span className="block text-sm font-medium text-slate-800">정기모의고사</span>
                  <span className="block text-xs text-slate-500">전과목 한번에 입력, 회차별 관리</span>
                </div>
              </label>
            </div>
            {editingId && (
              <p className="mt-1 text-xs text-slate-400">시험 분류는 생성 후 변경할 수 없습니다.</p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">시험 종류명</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="예: 주간 모의고사"
                required
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">대상 직렬</span>
              <select
                value={form.studyTrack}
                onChange={(event) =>
                  setForm((current) => ({ ...current, studyTrack: event.target.value }))
                }
                className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value={COMMON_TRACK_VALUE}>공통 시험</option>
                {trackOptions.map((track) => (
                  <option key={track} value={track}>
                    {track}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center justify-between rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-slate-800">활성 상태</span>
              <span className="block text-xs text-slate-500">
                비활성 템플릿은 새 성적 입력 선택지에서 숨겨지지만 기존 기록은 유지됩니다.
              </span>
            </span>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              className="h-5 w-5 rounded border-slate-300"
            />
          </label>

          <div className="space-y-3 rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xl font-bold text-slate-950">과목 구성</p>
                <p className="mt-1 text-xs text-slate-500">
                  직렬에 맞는 과목명, 문항 수, 문항당 배점을 설정하세요.
                </p>
              </div>
              <button
                type="button"
                onClick={appendSubject}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                <Plus className="h-4 w-4" />
                과목 추가
              </button>
            </div>

            {form.subjects.map((subject, index) => {
              const maxScore = calculateMaxScore(subject.totalItems, subject.pointsPerItem);

              return (
                <div key={subject.localId} className="rounded-[10px] border border-slate-200-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-900">과목 {index + 1}</p>
                    <button
                      type="button"
                      onClick={() => removeSubject(subject.localId)}
                      disabled={form.subjects.length === 1}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-200-slate-200 text-rose-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="과목 삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_0.7fr_0.7fr]">
                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-600">과목명</span>
                      <input
                        value={subject.name}
                        onChange={(event) =>
                          updateSubject(subject.localId, (current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                        placeholder="예: 영어"
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-600">문항 수</span>
                      <input
                        value={subject.totalItems}
                        onChange={(event) =>
                          updateSubject(subject.localId, (current) => ({
                            ...current,
                            totalItems: event.target.value,
                          }))
                        }
                        className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                        placeholder="20"
                        inputMode="numeric"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-medium text-slate-600">문항당 배점</span>
                      <input
                        value={subject.pointsPerItem}
                        onChange={(event) =>
                          updateSubject(subject.localId, (current) => ({
                            ...current,
                            pointsPerItem: event.target.value,
                          }))
                        }
                        className="w-full rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                        placeholder="5"
                        inputMode="decimal"
                      />
                    </label>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                      {maxScore !== null ? `이 과목 만점은 ${maxScore}점입니다.` : "문항 수와 배점을 모두 입력하면 만점이 계산됩니다."}
                    </div>

                    <label className="flex items-center justify-between rounded-[10px] border border-slate-200-slate-200 bg-white px-4 py-3">
                      <span>
                        <span className="block text-sm font-medium text-slate-800">과목 활성</span>
                        <span className="block text-xs text-slate-500">
                          비활성 과목은 과거 기록을 보존한 채 새 입력 화면에서 제외됩니다.
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        checked={subject.isActive}
                        onChange={(event) =>
                          updateSubject(subject.localId, (current) => ({
                            ...current,
                            isActive: event.target.checked,
                          }))
                        }
                        className="h-5 w-5 rounded border-slate-300"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-4 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingId ? "시험 템플릿 저장" : "시험 템플릿 추가"}
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
  );
}
