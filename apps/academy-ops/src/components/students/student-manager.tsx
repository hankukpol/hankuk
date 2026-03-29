"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ExamType, StudentType } from "@prisma/client";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  BulkSelectHeaderCheckbox,
  BulkSelectRowCheckbox,
  BulkSelectionActionBar,
} from "@/components/ui/bulk-select-table";
import {
  EXAM_TYPE_LABEL,
  EXAM_TYPE_VALUES,
  STUDENT_TYPE_LABEL,
  STUDENT_TYPE_VALUES,
} from "@/lib/constants";
import { toDateInputValue, todayDateInputValue } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";
import { useFilterPresets } from "@/hooks/use-filter-presets";

const STUDENT_FILTER_STORAGE_KEY = "students-list-filters";

type StudentRow = {
  examNumber: string;
  name: string;
  phone: string | null;
  generation: number | null;
  className: string | null;
  examType: ExamType;
  studentType: StudentType;
  onlineId: string | null;
  registeredAt: string | null;
  note: string | null;
  isActive: boolean;
  currentStatus: "NORMAL" | "WARNING_1" | "WARNING_2" | "DROPOUT";
  _count: {
    scores: number;
  };
};

type Filters = {
  examType: ExamType;
  search: string;
  generation: string;
  activeOnly: boolean;
  page: number;
  pageSize: number;
  totalCount: number;
  sort: string;
  sortDir: string;
};

type StudentManagerProps = {
  students: StudentRow[];
  filters: Filters;
};

type StudentFormState = {
  examNumber: string;
  name: string;
  phone: string;
  generation: string;
  className: string;
  examType: ExamType;
  studentType: StudentType;
  onlineId: string;
  registeredAt: string;
  note: string;
};

function createEmptyForm(examType: ExamType = "GONGCHAE"): StudentFormState {
  return {
    examNumber: "",
    name: "",
    phone: "",
    generation: "",
    className: "",
    examType,
    studentType: "NEW",
    onlineId: "",
    registeredAt: todayDateInputValue(),
    note: "",
  };
}

function parseExamType(value: string, fallback: ExamType): ExamType {
  return EXAM_TYPE_VALUES.includes(value as ExamType) ? (value as ExamType) : fallback;
}

function parseStudentType(value: string, fallback: StudentType): StudentType {
  return STUDENT_TYPE_VALUES.includes(value as StudentType)
    ? (value as StudentType)
    : fallback;
}

function buildDraft(student: StudentRow): StudentFormState {
  return {
    examNumber: student.examNumber,
    name: student.name,
    phone: student.phone ?? "",
    generation: student.generation ? String(student.generation) : "",
    className: student.className ?? "",
    examType: student.examType,
    studentType: student.studentType,
    onlineId: student.onlineId ?? "",
    registeredAt: toDateInputValue(student.registeredAt),
    note: student.note ?? "",
  };
}

function SortableHeader({
  column,
  label,
  currentSort,
  currentDir,
  onSort,
}: {
  column: string;
  label: string;
  currentSort: string;
  currentDir: string;
  onSort: (col: string, dir: string) => void;
}) {
  const isActive = currentSort === column;
  const nextDir = isActive && currentDir === "asc" ? "desc" : "asc";

  return (
    <button
      type="button"
      onClick={() => onSort(column, nextDir)}
      className="flex items-center gap-1 font-semibold hover:text-ember transition-colors"
    >
      {label}
      {isActive ? (
        <span className="text-ember">{currentDir === "asc" ? "↑" : "↓"}</span>
      ) : (
        <span className="text-gray-300">↕</span>
      )}
    </button>
  );
}

export function StudentManager({ students, filters }: StudentManagerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [createForm, setCreateForm] = useState<StudentFormState>(() => createEmptyForm(filters.examType));
  const [editingExamNumber, setEditingExamNumber] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, StudentFormState>>({});
  const [search, setSearch] = useState(filters.search);
  const [generation, setGeneration] = useState(filters.generation);
  const [activeOnly, setActiveOnly] = useState(filters.activeOnly);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [presetNameInput, setPresetNameInput] = useState("");
  const [showPresetSaveBox, setShowPresetSaveBox] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const { presets, savePreset, deletePreset } = useFilterPresets(STUDENT_FILTER_STORAGE_KEY);
  const [selectedExamNumbers, setSelectedExamNumbers] = useState<string[]>([]);
  const [bulkGeneration, setBulkGeneration] = useState("");
  const [isPending, startTransition] = useTransition();

  const rowDrafts = useMemo(
    () =>
      Object.fromEntries(
        students.map((student) => [student.examNumber, buildDraft(student)]),
      ) as Record<string, StudentFormState>,
    [students],
  );
  const currentPageExamNumbers = useMemo(
    () => students.map((student) => student.examNumber),
    [students],
  );
  const selectedStudents = useMemo(
    () => students.filter((student) => selectedExamNumbers.includes(student.examNumber)),
    [selectedExamNumbers, students],
  );
  const allCurrentPageSelected =
    currentPageExamNumbers.length > 0 &&
    currentPageExamNumbers.every((examNumber) => selectedExamNumbers.includes(examNumber));
  const someCurrentPageSelected =
    currentPageExamNumbers.some((examNumber) => selectedExamNumbers.includes(examNumber)) &&
    !allCurrentPageSelected;
  const selectedActiveCount = selectedStudents.filter((student) => student.isActive).length;

  useEffect(() => {
    setSelectedExamNumbers([]);
    setBulkGeneration("");
  }, [
    filters.activeOnly,
    filters.examType,
    filters.generation,
    filters.page,
    filters.pageSize,
    filters.search,
  ]);

  function getDraft(examNumber: string) {
    return drafts[examNumber] ?? rowDrafts[examNumber];
  }

  function getCurrentFilterState() {
    return {
      examType: filters.examType,
      search,
      generation,
      activeOnly: activeOnly ? "true" : "false",
    };
  }

  function handleSavePreset() {
    const name = presetNameInput.trim();
    if (!name) return;
    const preset = savePreset(name, getCurrentFilterState());
    if (preset) {
      setSelectedPresetId(preset.id);
      setPresetNameInput("");
      setShowPresetSaveBox(false);
    }
  }

  function handleApplyPreset(presetId: string) {
    setSelectedPresetId(presetId);
    if (!presetId) return;
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) return;
    const f = preset.filters;
    const nextExamType = (f.examType === "GONGCHAE" || f.examType === "GYEONGCHAE")
      ? (f.examType as ExamType)
      : filters.examType;
    const nextSearch = f.search ?? "";
    const nextGeneration = f.generation ?? "";
    const nextActiveOnly = f.activeOnly !== "false";
    setSearch(nextSearch);
    setGeneration(nextGeneration);
    setActiveOnly(nextActiveOnly);
    refreshWithFiltersImmediate({ examType: nextExamType, search: nextSearch, generation: nextGeneration, activeOnly: nextActiveOnly, page: 1 });
  }

  function handleDeletePreset() {
    if (!selectedPresetId) return;
    const preset = presets.find((item) => item.id === selectedPresetId);
    if (!preset) return;
    const confirmed = window.confirm(`"${preset.name}" 프리셋을 삭제할까요?`);
    if (!confirmed) return;
    deletePreset(selectedPresetId);
    setSelectedPresetId("");
  }

  function refreshWithFiltersImmediate(
    nextFilters: Partial<
      Pick<Filters, "examType" | "search" | "generation" | "activeOnly" | "page" | "pageSize">
    >,
  ) {
    const params = new URLSearchParams();
    const merged = {
      examType: filters.examType,
      search,
      generation,
      activeOnly,
      page: filters.page,
      pageSize: filters.pageSize,
      ...nextFilters,
    };

    params.set("examType", merged.examType);
    params.set("page", String(merged.page));
    params.set("pageSize", String(merged.pageSize));

    if (merged.search.trim()) {
      params.set("search", merged.search.trim());
    }

    if (merged.generation.trim()) {
      params.set("generation", merged.generation.trim());
    }

    if (!merged.activeOnly) {
      params.set("activeOnly", "false");
    }

    if (filters.sort) {
      params.set("sort", filters.sort);
    }

    if (filters.sortDir) {
      params.set("sortDir", filters.sortDir);
    }

    router.push(`/admin/students?${params.toString()}`);
  }

  function refreshWithFilters(
    nextFilters?: Partial<
      Pick<Filters, "examType" | "search" | "generation" | "activeOnly" | "page" | "pageSize">
    >,
  ) {
    const params = new URLSearchParams();
    const merged = {
      examType: filters.examType,
      search,
      generation,
      activeOnly,
      page: filters.page,
      pageSize: filters.pageSize,
      ...nextFilters,
    };

    params.set("examType", merged.examType);
    params.set("page", String(merged.page));
    params.set("pageSize", String(merged.pageSize));

    if (merged.search.trim()) {
      params.set("search", merged.search.trim());
    }

    if (merged.generation.trim()) {
      params.set("generation", merged.generation.trim());
    }

    if (!merged.activeOnly) {
      params.set("activeOnly", "false");
    }

    if (filters.sort) {
      params.set("sort", filters.sort);
    }

    if (filters.sortDir) {
      params.set("sortDir", filters.sortDir);
    }

    router.push(`/admin/students?${params.toString()}`);
  }

  function handleSort(col: string, dir: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("sort", col);
    params.set("sortDir", dir);
    params.set("page", "1");
    router.push(`?${params.toString()}`);
  }

  async function requestJson<T = Record<string, unknown>>(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const text = await response.text();
    let payload: T & { error?: string } = {} as T & { error?: string };

    if (text.trim()) {
      try {
        payload = (JSON.parse(text) as T & { error?: string }) ?? ({} as T & { error?: string });
      } catch {
        payload = {} as T & { error?: string };
      }
    }

    if (!response.ok) {
      throw new Error(payload.error ?? "Request failed.");
    }

    return payload as T;
  }
  function run(action: () => Promise<void>) {
    setNotice(null);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        await action();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "작업 처리 중 오류가 발생했습니다.",
        );
      }
    });
  }

  function toggleStudentSelection(examNumber: string, checked: boolean) {
    setSelectedExamNumbers((current) =>
      checked
        ? Array.from(new Set([...current, examNumber]))
        : current.filter((value) => value !== examNumber),
    );
  }

  function toggleCurrentPageSelection(checked: boolean) {
    setSelectedExamNumbers((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...currentPageExamNumbers]));
      }

      return current.filter((examNumber) => !currentPageExamNumbers.includes(examNumber));
    });
  }

  function clearSelection() {
    setSelectedExamNumbers([]);
    setBulkGeneration("");
  }

  function patchDraft(examNumber: string, patch: Partial<StudentFormState>) {
    setDrafts((current) => ({
      ...current,
      [examNumber]: {
        ...(current[examNumber] ?? rowDrafts[examNumber]),
        ...patch,
      },
    }));
  }

  function beginEditingStudent(student: StudentRow) {
    setDrafts((current) => ({
      ...current,
      [student.examNumber]: buildDraft(student),
    }));
    setEditingExamNumber(student.examNumber);
  }

  function saveStudent(student: StudentRow) {
    const draft = getDraft(student.examNumber);
    run(async () => {
      await requestJson(`/api/students/${student.examNumber}`, {
        method: "PUT",
        body: JSON.stringify(draft),
      });
      setNotice("수강생 정보를 수정했습니다.");
      setEditingExamNumber(null);
      refreshWithFilters();
    });
  }

  function deactivateStudent(examNumber: string) {
    run(async () => {
      await requestJson(`/api/students/${examNumber}`, {
        method: "DELETE",
      });
      setNotice("수강생을 비활성화하고 학생 포털 접근을 차단했습니다.");
      refreshWithFilters();
    });
  }

  function reactivateStudent(examNumber: string) {
    run(async () => {
      await requestJson(`/api/students/${examNumber}`, {
        method: "PATCH",
      });
      setNotice("수강생을 다시 활성화하고 학생 포털 접근을 허용했습니다.");
      refreshWithFilters();
    });
  }

  function renderPortalAccessBadge(isActive: boolean) {
    return (
      <span
        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
          isActive
            ? "border-forest/20 bg-forest/10 text-forest"
            : "border-ink/10 bg-mist text-slate"
        }`}
      >
        {isActive ? "접근 가능" : "접근 불가"}
      </span>
    );
  }

  function bulkDeactivateStudents() {
    if (selectedExamNumbers.length === 0) {
      setErrorMessage("비활성화할 수강생을 선택해 주세요.");
      return;
    }

    run(async () => {
      const result = await requestJson<{
        updatedCount: number;
        skippedCount: number;
        missingExamNumbers: string[];
      }>("/api/students/bulk", {
        method: "POST",
        body: JSON.stringify({ action: "deactivate", examNumbers: selectedExamNumbers }),
      });
      clearSelection();
      const suffix = [
        result.skippedCount > 0
          ? `이미 비활성 ${result.skippedCount}명`
          : null,
        result.missingExamNumbers.length > 0
          ? `미조회 ${result.missingExamNumbers.length}명`
          : null,
      ].filter(Boolean);
      setNotice(
        `선택 수강생 ${result.updatedCount}명을 비활성화했습니다.${suffix.length > 0 ? ` (${suffix.join(", ")})` : ""}`,
      );
      refreshWithFilters();
    });
  }

  function bulkChangeGeneration() {
    if (selectedExamNumbers.length === 0) {
      setErrorMessage("기수를 변경할 수강생을 선택해 주세요.");
      return;
    }

    const nextGeneration = bulkGeneration.trim();
    if (!nextGeneration) {
      setErrorMessage("변경할 기수를 입력해 주세요.");
      return;
    }

    const generationValue = Number(nextGeneration);
    if (!Number.isInteger(generationValue) || generationValue < 0) {
      setErrorMessage("기수는 0 이상의 정수로 입력해 주세요.");
      return;
    }

    run(async () => {
      const result = await requestJson<{
        updatedCount: number;
        skippedCount: number;
        missingExamNumbers: string[];
        generation: number | null;
      }>("/api/students/bulk", {
        method: "POST",
        body: JSON.stringify({
          action: "setGeneration",
          examNumbers: selectedExamNumbers,
          generation: generationValue,
        }),
      });
      clearSelection();
      const suffix = [
        result.skippedCount > 0
          ? `동일 기수 ${result.skippedCount}명`
          : null,
        result.missingExamNumbers.length > 0
          ? `미조회 ${result.missingExamNumbers.length}명`
          : null,
      ].filter(Boolean);
      setNotice(
        `선택 수강생 ${result.updatedCount}명의 기수를 ${generationValue}기로 변경했습니다.${suffix.length > 0 ? ` (${suffix.join(", ")})` : ""}`,
      );
      refreshWithFilters();
    });
  }
  return (
    <div className="space-y-8">
      <section className="rounded-[28px] border border-ink/10 bg-mist p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">수강생 등록</h2>
            <p className="mt-2 text-sm leading-7 text-slate">
              개별 등록과 수정은 이 화면에서 처리하고, 대량 등록은 붙여넣기 등록 화면을 사용합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              prefetch={false}
              href={`/admin/students/import?examType=${filters.examType}`}
              className="inline-flex items-center rounded-full bg-forest px-4 py-2 text-sm font-semibold text-white transition hover:bg-forest/80"
            >
              CSV/Excel 가져오기
            </Link>
            <Link
              prefetch={false}
              href={`/admin/students/paste-import?examType=${filters.examType}`}
              className="inline-flex items-center rounded-full border border-ember/30 px-4 py-2 text-sm font-semibold text-ember transition hover:bg-ember/10"
            >
              붙여넣기 등록
            </Link>
            <Link
              prefetch={false}
              href="/admin/students/transfer"
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-forest/30 hover:text-forest"
            >
              수험번호 이전
            </Link>
            <Link
              prefetch={false}
              href="/admin/students/merge"
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-forest/30 hover:text-forest"
            >
              학생 병합
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium">수험번호</label>
            <input
              value={createForm.examNumber}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, examNumber: event.target.value }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">이름</label>
            <input
              value={createForm.name}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, name: event.target.value }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">연락처</label>
            <input
              value={createForm.phone}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, phone: event.target.value }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">기수</label>
            <input
              value={createForm.generation}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, generation: event.target.value }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium">반</label>
            <input
              value={createForm.className}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, className: event.target.value }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">직렬</label>
            <select
              value={createForm.examType}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  examType: parseExamType(event.target.value, current.examType),
                }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="GONGCHAE">{EXAM_TYPE_LABEL.GONGCHAE}</option>
              <option value="GYEONGCHAE">{EXAM_TYPE_LABEL.GYEONGCHAE}</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">학생 구분</label>
            <select
              value={createForm.studentType}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  studentType: parseStudentType(event.target.value, current.studentType),
                }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            >
              <option value="NEW">{STUDENT_TYPE_LABEL.NEW}</option>
              <option value="EXISTING">{STUDENT_TYPE_LABEL.EXISTING}</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">등록일</label>
            <input
              type="date"
              value={createForm.registeredAt}
              onChange={(event) =>
                setCreateForm((current) => ({
                  ...current,
                  registeredAt: event.target.value,
                }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="mb-2 block text-sm font-medium">온라인 ID</label>
            <input
              value={createForm.onlineId}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, onlineId: event.target.value }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">메모</label>
            <input
              value={createForm.note}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, note: event.target.value }))
              }
              className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() =>
              run(async () => {
                await requestJson("/api/students", {
                  method: "POST",
                  body: JSON.stringify(createForm),
                });
                setNotice("수강생을 등록했습니다.");
                setCreateForm(createEmptyForm(filters.examType));
                refreshWithFilters();
              })
            }
            disabled={isPending}
            className="mt-7 inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            등록
          </button>
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/10 bg-white p-6">
        {/* Filter Preset Bar */}
        <div className="mb-4 rounded-[20px] border border-ink/10 bg-mist px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-slate">필터 프리셋</span>
            <select
              value={selectedPresetId}
              onChange={(event) => handleApplyPreset(event.target.value)}
              className="min-w-[180px] flex-1 rounded-2xl border border-ink/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">프리셋 선택...</option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowPresetSaveBox((current) => !current)}
              className="inline-flex items-center rounded-full border border-ink/10 bg-white px-3 py-2 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
            >
              현재 필터 저장
            </button>
            <button
              type="button"
              onClick={handleDeletePreset}
              disabled={!selectedPresetId}
              className="inline-flex items-center rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              프리셋 삭제
            </button>
          </div>
          {showPresetSaveBox && (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={presetNameInput}
                onChange={(event) => setPresetNameInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") handleSavePreset(); }}
                placeholder={presets.length >= 5 ? "최대 5개 저장 가능합니다" : "프리셋 이름 입력"}
                disabled={presets.length >= 5}
                className="flex-1 rounded-2xl border border-ink/10 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                autoFocus
              />
              <button
                type="button"
                onClick={handleSavePreset}
                disabled={!presetNameInput.trim() || presets.length >= 5}
                className="inline-flex items-center rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:opacity-40"
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => { setShowPresetSaveBox(false); setPresetNameInput(""); }}
                className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold transition hover:border-ink/30"
              >
                취소
              </button>
            </div>
          )}
          {presets.length >= 5 && (
            <p className="mt-2 text-xs text-amber-700">최대 5개까지 저장할 수 있습니다. 기존 프리셋을 삭제한 후 저장하세요.</p>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-2 block text-sm font-medium">직렬</label>
            <div className="flex gap-2">
              {(["GONGCHAE", "GYEONGCHAE"] as const).map((examType) => (
                <button
                  key={examType}
                  type="button"
                  onClick={() => refreshWithFilters({ examType, page: 1 })}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    filters.examType === examType
                      ? "bg-ink text-white"
                      : "border border-ink/10 text-ink hover:border-ember/30 hover:text-ember"
                  }`}
                >
                  {EXAM_TYPE_LABEL[examType]}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="mb-2 block text-sm font-medium">검색</label>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm"
              placeholder="수험번호 또는 이름"
            />
          </div>
          <div className="w-full max-w-[180px]">
            <label className="mb-2 block text-sm font-medium">기수</label>
            <input
              value={generation}
              onChange={(event) => setGeneration(event.target.value)}
              className="w-full rounded-2xl border border-ink/10 bg-mist px-4 py-3 text-sm"
            />
          </div>
          <label className="mb-3 inline-flex items-center gap-2 text-sm text-slate">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(event) => setActiveOnly(event.target.checked)}
            />
            활성 학생만 보기
          </label>
          <button
            type="button"
            onClick={() => refreshWithFilters({ page: 1 })}
            className="mb-1 inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
          >
            필터 적용
          </button>
        </div>

        {notice ? (
          <div role="status" aria-live="polite" className="mt-6 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
            {notice}
          </div>
        ) : null}
        {errorMessage ? (
          <div role="alert" aria-live="assertive" className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-[24px] border border-ink/10">
          <PaginationControls
            totalCount={filters.totalCount}
            page={filters.page}
            pageSize={filters.pageSize}
            onPageChange={(nextPage) => refreshWithFilters({ page: nextPage })}
            onPageSizeChange={(nextPageSize) =>
              refreshWithFilters({ page: 1, pageSize: nextPageSize })
            }
            itemLabel="명"
          />
          <div className="hidden sm:block overflow-x-auto">
          <table className="min-w-full divide-y divide-ink/10 text-sm">
            <caption className="sr-only">Student list with generation, portal access, and management actions.</caption>
            <thead className="text-left">
              <tr>
                <th className="sticky top-0 z-10 px-4 py-3 font-semibold bg-mist/95 backdrop-blur-sm">
                  <BulkSelectHeaderCheckbox
                    checked={allCurrentPageSelected}
                    indeterminate={someCurrentPageSelected}
                    disabled={students.length === 0}
                    onChange={toggleCurrentPageSelection}
                    ariaLabel="현재 페이지 수강생 전체 선택"
                  />
                </th>
                <th className="sticky top-0 z-10 px-4 py-3 font-semibold bg-mist/95 backdrop-blur-sm">
                  <SortableHeader
                    column="examNumber"
                    label="수험번호"
                    currentSort={filters.sort}
                    currentDir={filters.sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="sticky top-0 z-10 px-4 py-3 font-semibold bg-mist/95 backdrop-blur-sm">
                  <SortableHeader
                    column="name"
                    label="이름"
                    currentSort={filters.sort}
                    currentDir={filters.sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="sticky top-0 z-10 px-4 py-3 font-semibold bg-mist/95 backdrop-blur-sm">연락처</th>
                <th className="sticky top-0 z-10 px-4 py-3 font-semibold bg-mist/95 backdrop-blur-sm">기수</th>
                <th className="sticky top-0 z-10 px-4 py-3 font-semibold bg-mist/95 backdrop-blur-sm">반</th>
                <th className="sticky top-0 z-10 px-4 py-3 font-semibold bg-mist/95 backdrop-blur-sm">구분</th>
                <th className="sticky top-0 z-10 px-4 py-3 font-semibold bg-mist/95 backdrop-blur-sm">포털 접근</th>
                <th className="sticky top-0 z-10 px-4 py-3 font-semibold bg-mist/95 backdrop-blur-sm">성적 수</th>
                <th className="sticky top-0 z-10 px-4 py-3 font-semibold bg-mist/95 backdrop-blur-sm">
                  <SortableHeader
                    column="registeredAt"
                    label="등록일"
                    currentSort={filters.sort}
                    currentDir={filters.sortDir}
                    onSort={handleSort}
                  />
                </th>
                <th className="sticky top-0 z-10 px-4 py-3 font-semibold bg-mist/95 backdrop-blur-sm">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/10 bg-white">
              {students.map((student) => {
                const draft = getDraft(student.examNumber);

                return (
                  <tr key={student.examNumber}>
                    <td className="px-4 py-3">
                      <BulkSelectRowCheckbox
                        checked={selectedExamNumbers.includes(student.examNumber)}
                        onChange={(checked) => toggleStudentSelection(student.examNumber, checked)}
                        ariaLabel={`${student.examNumber} 선택`}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium">{student.examNumber}</td>
                    <td className="px-4 py-3">
                      {editingExamNumber === student.examNumber ? (
                        <input
                          value={draft.name}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [student.examNumber]: {
                                ...draft,
                                name: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
                        />
                      ) : (
                        student.name
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingExamNumber === student.examNumber ? (
                        <input
                          value={draft.phone}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [student.examNumber]: {
                                ...draft,
                                phone: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
                        />
                      ) : (
                        student.phone ?? "-"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingExamNumber === student.examNumber ? (
                        <input
                          value={draft.generation}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [student.examNumber]: {
                                ...draft,
                                generation: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
                        />
                      ) : (
                        student.generation ?? "-"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingExamNumber === student.examNumber ? (
                        <input
                          value={draft.className}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [student.examNumber]: {
                                ...draft,
                                className: event.target.value,
                              },
                            }))
                          }
                          className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
                        />
                      ) : (
                        student.className ?? "-"
                      )}
                    </td>
                    <td className="px-4 py-3">{STUDENT_TYPE_LABEL[student.studentType]}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                          student.isActive
                            ? "border-forest/20 bg-forest/10 text-forest"
                            : "border-ink/10 bg-mist text-slate"
                        }`}
                      >
                        {student.isActive ? "접근 가능" : "접근 불가"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{student._count.scores}</td>
                    <td className="px-4 py-3 text-sm text-slate">
                      {student.registeredAt
                        ? new Date(student.registeredAt).toLocaleDateString("ko-KR", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          prefetch={false}
                          href={`/admin/students/${student.examNumber}`}
                          className="rounded-full border border-ink/10 px-3 py-2 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
                        >
                          상세 보기
                        </Link>
                        {editingExamNumber === student.examNumber ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                run(async () => {
                                  await requestJson(`/api/students/${student.examNumber}`, {
                                    method: "PUT",
                                    body: JSON.stringify(draft),
                                  });
                                  setNotice("수강생 정보를 수정했습니다.");
                                  setEditingExamNumber(null);
                                  refreshWithFilters();
                                })
                              }
                              disabled={isPending}
                              className="rounded-full border border-ink/10 px-3 py-2 text-xs font-semibold transition hover:border-forest/30 hover:text-forest"
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingExamNumber(null)}
                              className="rounded-full border border-ink/10 px-3 py-2 text-xs font-semibold transition hover:border-ink/30"
                            >
                              취소
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setDrafts((current) => ({
                                  ...current,
                                  [student.examNumber]: buildDraft(student),
                                }));
                                setEditingExamNumber(student.examNumber);
                              }}
                              className="rounded-full border border-ink/10 px-3 py-2 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
                            >
                              수정
                            </button>
                            {student.isActive ? (
                              <button
                                type="button"
                                onClick={() =>
                                  run(async () => {
                                    await requestJson(`/api/students/${student.examNumber}`, {
                                      method: "DELETE",
                                    });
                                    setNotice("수강생을 비활성화하고 학생 포털 접근을 차단했습니다.");
                                    refreshWithFilters();
                                  })
                                }
                                disabled={isPending}
                                className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                비활성화
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  run(async () => {
                                    await requestJson(`/api/students/${student.examNumber}`, {
                                      method: "PATCH",
                                    });
                                    setNotice("수강생을 다시 활성화하고 학생 포털 접근을 허용했습니다.");
                                    refreshWithFilters();
                                  })
                                }
                                disabled={isPending}
                                className="rounded-full border border-forest/30 px-3 py-2 text-xs font-semibold text-forest transition hover:bg-forest/10 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                포털 활성화
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      {editingExamNumber === student.examNumber ? (
                        <div className="mt-3 grid gap-2">
                          <div className="grid gap-2 md:grid-cols-2">
                            <select
                              value={draft.studentType}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [student.examNumber]: {
                                    ...draft,
                                    studentType: parseStudentType(
                                      event.target.value,
                                      draft.studentType,
                                    ),
                                  },
                                }))
                              }
                              className="rounded-xl border border-ink/10 px-3 py-2 text-sm"
                            >
                              <option value="NEW">{STUDENT_TYPE_LABEL.NEW}</option>
                              <option value="EXISTING">{STUDENT_TYPE_LABEL.EXISTING}</option>
                            </select>
                            <input
                              type="date"
                              value={draft.registeredAt}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [student.examNumber]: {
                                    ...draft,
                                    registeredAt: event.target.value,
                                  },
                                }))
                              }
                              className="rounded-xl border border-ink/10 px-3 py-2 text-sm"
                            />
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            <input
                              value={draft.onlineId}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [student.examNumber]: {
                                    ...draft,
                                    onlineId: event.target.value,
                                  },
                                }))
                              }
                              className="rounded-xl border border-ink/10 px-3 py-2 text-sm"
                              placeholder="온라인 ID"
                            />
                            <input
                              value={draft.note}
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [student.examNumber]: {
                                    ...draft,
                                    note: event.target.value,
                                  },
                                }))
                              }
                              className="rounded-xl border border-ink/10 px-3 py-2 text-sm"
                              placeholder="메모"
                            />
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {filters.totalCount === 0 ? (
                <tr>
                  <td colSpan={11}>
                    <EmptyState
                      title="등록된 수강생이 없습니다."
                      description="검색 조건을 변경하거나 새 학생을 등록해보세요."
                    />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
          <div className="px-4 pt-4 sm:hidden">
            <button
              type="button"
              onClick={() => toggleCurrentPageSelection(!allCurrentPageSelected)}
              disabled={students.length === 0}
              className="inline-flex items-center rounded-full border border-ink/10 px-4 py-2 text-xs font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-50"
            >
              {allCurrentPageSelected
                ? "현재 페이지 선택 해제"
                : "현재 페이지 전체 선택"}
            </button>
          </div>
          <div className="space-y-4 px-4 pb-4 sm:hidden">
            {students.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-ink/10 px-4 py-8 text-center text-sm text-slate">
                {"조건에 맞는 수강생이 없습니다."}
              </div>
            ) : (
              students.map((student) => {
                const draft = getDraft(student.examNumber);
                const isEditing = editingExamNumber === student.examNumber;
                const isSelected = selectedExamNumbers.includes(student.examNumber);
                return (
                  <article
                    key={student.examNumber}
                    className={`rounded-[24px] border p-4 shadow-sm ${
                      isSelected
                        ? "border-ember/30 bg-ember/5"
                        : "border-ink/10 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-semibold text-ink">
                          {student.examNumber} {"·"} {student.name}
                        </h3>
                        <p className="mt-1 text-sm text-slate">
                          {EXAM_TYPE_LABEL[student.examType]} {"·"} {STUDENT_TYPE_LABEL[student.studentType]}
                        </p>
                      </div>
                      <BulkSelectRowCheckbox
                        checked={isSelected}
                        onChange={(checked) => toggleStudentSelection(student.examNumber, checked)}
                        ariaLabel={`${student.examNumber} 선택`}
                      />
                    </div>
                    <div className="mt-4 grid gap-3 rounded-[20px] bg-mist/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-slate">{"연락처"}</span>
                        <span className="text-sm font-semibold text-ink">{student.phone ?? "-"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-slate">{"기수 / 반"}</span>
                        <span className="text-sm font-semibold text-ink">
                          {(student.generation ?? "-").toString()} {"/"} {student.className ?? "-"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-slate">{"구분"}</span>
                        <span className="text-sm font-semibold text-ink">{STUDENT_TYPE_LABEL[student.studentType]}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-slate">{"포털 접근"}</span>
                        {renderPortalAccessBadge(student.isActive)}
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-slate">{"성적 수"}</span>
                        <span className="text-sm font-semibold text-ink">{student._count.scores}</span>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        prefetch={false}
                        href={`/admin/students/${student.examNumber}`}
                        className="rounded-full border border-ink/10 px-3 py-2 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
                      >
                        {"상세 보기"}
                      </Link>
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => saveStudent(student)}
                            disabled={isPending}
                            className="rounded-full border border-ink/10 px-3 py-2 text-xs font-semibold transition hover:border-forest/30 hover:text-forest"
                          >
                            {"저장"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingExamNumber(null)}
                            className="rounded-full border border-ink/10 px-3 py-2 text-xs font-semibold transition hover:border-ink/30"
                          >
                            {"취소"}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => beginEditingStudent(student)}
                            className="rounded-full border border-ink/10 px-3 py-2 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
                          >
                            {"수정"}
                          </button>
                          {student.isActive ? (
                            <button
                              type="button"
                              onClick={() => deactivateStudent(student.examNumber)}
                              disabled={isPending}
                              className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {"비활성화"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => reactivateStudent(student.examNumber)}
                              disabled={isPending}
                              className="rounded-full border border-forest/30 px-3 py-2 text-xs font-semibold text-forest transition hover:bg-forest/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {"포털 활성화"}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="mt-4 grid gap-3 rounded-[20px] border border-ink/10 p-4">
                        <input
                          value={draft.name}
                          onChange={(event) => patchDraft(student.examNumber, { name: event.target.value })}
                          className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
                          placeholder={"이름"}
                        />
                        <input
                          value={draft.phone}
                          onChange={(event) => patchDraft(student.examNumber, { phone: event.target.value })}
                          className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
                          placeholder={"연락처"}
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <input
                            value={draft.generation}
                            onChange={(event) => patchDraft(student.examNumber, { generation: event.target.value })}
                            className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
                            placeholder={"기수"}
                          />
                          <input
                            value={draft.className}
                            onChange={(event) => patchDraft(student.examNumber, { className: event.target.value })}
                            className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
                            placeholder={"반"}
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <select
                            value={draft.studentType}
                            onChange={(event) =>
                              patchDraft(student.examNumber, {
                                studentType: parseStudentType(event.target.value, draft.studentType),
                              })
                            }
                            className="rounded-xl border border-ink/10 px-3 py-2 text-sm"
                          >
                            <option value="NEW">{STUDENT_TYPE_LABEL.NEW}</option>
                            <option value="EXISTING">{STUDENT_TYPE_LABEL.EXISTING}</option>
                          </select>
                          <input
                            type="date"
                            value={draft.registeredAt}
                            onChange={(event) => patchDraft(student.examNumber, { registeredAt: event.target.value })}
                            className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
                          />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <input
                            value={draft.onlineId}
                            onChange={(event) => patchDraft(student.examNumber, { onlineId: event.target.value })}
                            className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
                            placeholder={"온라인 ID"}
                          />
                          <input
                            value={draft.note}
                            onChange={(event) => patchDraft(student.examNumber, { note: event.target.value })}
                            className="w-full rounded-xl border border-ink/10 px-3 py-2 text-sm"
                            placeholder={"메모"}
                          />
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </div>
      </section>
      <BulkSelectionActionBar selectedCount={selectedExamNumbers.length} onClear={clearSelection}>
        <button
          type="button"
          onClick={bulkDeactivateStudents}
          disabled={isPending || selectedActiveCount === 0}
          className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          일괄 비활성화
        </button>
        <div className="flex items-center gap-2 rounded-full border border-ink/10 bg-white px-2 py-1">
          <input
            value={bulkGeneration}
            onChange={(event) => setBulkGeneration(event.target.value)}
            inputMode="numeric"
            className="w-20 rounded-full border border-transparent px-3 py-1 text-xs text-ink outline-none focus:border-ink/10"
            placeholder="기수"
            aria-label="선택 수강생 기수 변경"
          />
          <button
            type="button"
            onClick={bulkChangeGeneration}
            disabled={isPending}
            className="rounded-full bg-ink px-3 py-2 text-xs font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
          >
            기수 변경
          </button>
        </div>
      </BulkSelectionActionBar>
    </div>
  );
}
