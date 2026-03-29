"use client";

import Link from "next/link";
import { CourseCategory, CourseStatus, ExamType } from "@prisma/client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";

type CourseRecord = {
  id: number;
  name: string;
  category: CourseCategory;
  examType: ExamType | null;
  tuitionFee: number;
  description: string | null;
  status: CourseStatus;
  isActive: boolean;
  maxCapacity: number | null;
  cohortStartDate: string | null;
  cohortEndDate: string | null;
  createdAt: string;
  updatedAt: string;
};

type CourseManagerProps = {
  initialCourses: CourseRecord[];
};

const CATEGORY_LABELS: Record<CourseCategory, string> = {
  COMPREHENSIVE: "종합반",
  SINGLE: "단과",
  SPECIAL: "특강",
};

const STATUS_LABELS: Record<CourseStatus, string> = {
  ACTIVE: "모집중",
  CLOSED: "마감",
  FINISHED: "종료",
  CANCELLED: "취소",
};

const STATUS_COLORS: Record<CourseStatus, string> = {
  ACTIVE: "text-green-700 bg-green-50",
  CLOSED: "text-amber-700 bg-amber-50",
  FINISHED: "text-slate-500 bg-slate-100",
  CANCELLED: "text-red-600 bg-red-50",
};

const EXAM_TYPE_LABELS: Record<string, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

type FormState = {
  name: string;
  category: CourseCategory;
  examType: ExamType | "";
  tuitionFee: string;
  description: string;
  maxCapacity: string;
  cohortStartDate: string;
  cohortEndDate: string;
  editStatus: CourseStatus | undefined;
};

const DEFAULT_FORM: FormState = {
  name: "",
  category: CourseCategory.COMPREHENSIVE,
  examType: "",
  tuitionFee: "",
  description: "",
  maxCapacity: "",
  cohortStartDate: "",
  cohortEndDate: "",
  editStatus: undefined,
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "요청에 실패했습니다.");
  return payload as T;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function CourseManager({ initialCourses }: CourseManagerProps) {
  const [courses, setCourses] = useState<CourseRecord[]>(initialCourses);
  const [filterCategory, setFilterCategory] = useState<CourseCategory | "ALL">("ALL");
  const [filterStatus, setFilterStatus] = useState<CourseStatus | "ALL">("ALL");
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();

  const filteredCourses = courses.filter((course) => {
    if (filterCategory !== "ALL" && course.category !== filterCategory) return false;
    if (filterStatus !== "ALL" && course.status !== filterStatus) return false;
    return true;
  });

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setErrorMessage(null);
    setIsFormOpen(true);
  }

  function openEdit(course: CourseRecord) {
    setEditingId(course.id);
    setForm({
      name: course.name,
      category: course.category,
      examType: course.examType ?? "",
      tuitionFee: String(course.tuitionFee),
      description: course.description ?? "",
      maxCapacity: course.maxCapacity != null ? String(course.maxCapacity) : "",
      cohortStartDate: course.cohortStartDate
        ? course.cohortStartDate.slice(0, 10)
        : "",
      cohortEndDate: course.cohortEndDate ? course.cohortEndDate.slice(0, 10) : "",
      editStatus: course.status,
    });
    setErrorMessage(null);
    setIsFormOpen(true);
  }

  function closeForm() {
    setIsFormOpen(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setErrorMessage(null);
  }

  function handleSave() {
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const body = {
          name: form.name,
          category: form.category,
          examType: form.examType || null,
          tuitionFee: form.tuitionFee === "" ? 0 : Number(form.tuitionFee),
          description: form.description || null,
          maxCapacity: form.maxCapacity ? Number(form.maxCapacity) : null,
          cohortStartDate: form.cohortStartDate || null,
          cohortEndDate: form.cohortEndDate || null,
          ...(editingId !== null && form.editStatus !== undefined
            ? { status: form.editStatus }
            : {}),
        };

        if (editingId !== null) {
          const result = await requestJson<{ course: CourseRecord }>(
            `/api/courses/${editingId}`,
            { method: "PATCH", body: JSON.stringify(body) },
          );
          setCourses((prev) =>
            prev.map((c) => (c.id === editingId ? result.course : c)),
          );
          toast.success("강좌를 수정했습니다.");
        } else {
          const result = await requestJson<{ course: CourseRecord }>("/api/courses", {
            method: "POST",
            body: JSON.stringify(body),
          });
          setCourses((prev) => [result.course, ...prev]);
          toast.success("강좌를 추가했습니다.");
        }

        closeForm();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "저장에 실패했습니다.",
        );
      }
    });
  }

  function handleDelete(course: CourseRecord) {
    confirmModal.openModal({
      badgeLabel: "삭제 확인",
      badgeTone: "warning",
      title: `강좌 삭제: ${course.name}`,
      description:
        "이 강좌를 삭제하시겠습니까? 삭제한 강좌는 다시 복구할 수 없습니다.",
      details: [
        `강좌명: ${course.name}`,
        `분류: ${CATEGORY_LABELS[course.category]}`,
        `수강료: ${course.tuitionFee.toLocaleString()}원`,
      ],
      cancelLabel: "취소",
      confirmLabel: "삭제",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();

        startTransition(async () => {
          try {
            await requestJson<{ success: true }>(`/api/courses/${course.id}`, {
              method: "DELETE",
            });
            setCourses((prev) => prev.filter((c) => c.id !== course.id));
            toast.success("강좌를 삭제했습니다.");
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "삭제에 실패했습니다.",
            );
          }
        });
      },
    });
  }

  const categoryFilters: Array<{ value: CourseCategory | "ALL"; label: string }> = [
    { value: "ALL", label: "전체" },
    { value: CourseCategory.COMPREHENSIVE, label: "종합반" },
    { value: CourseCategory.SINGLE, label: "단과" },
    { value: CourseCategory.SPECIAL, label: "특강" },
  ];

  const statusFilters: Array<{ value: CourseStatus | "ALL"; label: string }> = [
    { value: "ALL", label: "전체" },
    { value: CourseStatus.ACTIVE, label: "모집중" },
    { value: CourseStatus.CLOSED, label: "마감" },
    { value: CourseStatus.FINISHED, label: "종료" },
    { value: CourseStatus.CANCELLED, label: "취소" },
  ];

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1">
            {categoryFilters.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilterCategory(f.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filterCategory === f.value
                    ? "bg-ink text-white"
                    : "border border-ink/10 bg-white text-slate hover:border-ink/30"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {statusFilters.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilterStatus(f.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filterStatus === f.value
                    ? "bg-ink text-white"
                    : "border border-ink/10 bg-white text-slate hover:border-ink/30"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
        >
          <span>+</span>
          <span>새 강좌 추가</span>
        </button>
      </div>

      {/* Table */}
      <div className="rounded-[28px] border border-ink/10 bg-white overflow-hidden">
        <table className="min-w-full divide-y divide-ink/10 text-sm">
          <thead>
            <tr>
              {["강좌명", "분류", "시험유형", "수강료", "정원", "기수 기간", "상태", "액션"].map(
                (header) => (
                  <th
                    key={header}
                    className="text-xs font-medium text-slate uppercase px-4 py-3 bg-mist/50 text-left"
                  >
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {filteredCourses.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate">
                  조건에 맞는 강좌가 없습니다.
                </td>
              </tr>
            ) : null}
            {filteredCourses.map((course) => (
              <tr key={course.id} className="hover:bg-mist/30 transition">
                <td className="px-4 py-3 font-medium text-ink">
                  <div>{course.name}</div>
                  {course.description ? (
                    <div className="mt-0.5 text-xs text-slate line-clamp-1">
                      {course.description}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-slate">
                  {CATEGORY_LABELS[course.category]}
                </td>
                <td className="px-4 py-3 text-slate">
                  {course.examType ? EXAM_TYPE_LABELS[course.examType] ?? course.examType : "공통"}
                </td>
                <td className="px-4 py-3 tabular-nums text-ink">
                  {course.tuitionFee.toLocaleString()}원
                </td>
                <td className="px-4 py-3 text-slate">
                  {course.maxCapacity != null ? `${course.maxCapacity}명` : "무제한"}
                </td>
                <td className="px-4 py-3 text-slate text-xs">
                  {course.cohortStartDate || course.cohortEndDate ? (
                    <>
                      <div>{formatDate(course.cohortStartDate)}</div>
                      <div>~ {formatDate(course.cohortEndDate)}</div>
                    </>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[course.status]}`}
                  >
                    {STATUS_LABELS[course.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link
                      href={`/admin/settings/courses/${course.id}`}
                      className="inline-flex items-center rounded-full border border-forest/20 px-3 py-1 text-xs font-semibold text-forest transition hover:border-forest/50"
                    >
                      상세
                    </Link>
                    <button
                      type="button"
                      onClick={() => openEdit(course)}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(course)}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Modal */}
      <ActionModal
        open={isFormOpen}
        badgeLabel={editingId !== null ? "강좌 수정" : "강좌 추가"}
        badgeTone="default"
        title={editingId !== null ? "강좌 수정" : "새 강좌 추가"}
        description={
          editingId !== null
            ? "강좌 정보를 수정합니다."
            : "새 강좌를 등록합니다. 강좌명과 수강료는 필수 항목입니다."
        }
        panelClassName="max-w-lg"
        cancelLabel="취소"
        confirmLabel={isPending ? "저장 중..." : editingId !== null ? "수정 저장" : "강좌 추가"}
        isPending={isPending}
        onClose={closeForm}
        onConfirm={handleSave}
      >
        <div className="space-y-4">
          {errorMessage ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {/* 강좌명 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              강좌명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="예: 2026 공채 종합반 1기"
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
            />
          </div>

          {/* 분류 + 시험유형 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                분류 <span className="text-red-500">*</span>
              </label>
              <select
                value={form.category}
                onChange={(e) => setField("category", e.target.value as CourseCategory)}
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              >
                {(Object.keys(CATEGORY_LABELS) as CourseCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">시험유형</label>
              <select
                value={form.examType}
                onChange={(e) => setField("examType", e.target.value as ExamType | "")}
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              >
                <option value="">공통 (공채+경채)</option>
                <option value={ExamType.GONGCHAE}>공채</option>
                <option value={ExamType.GYEONGCHAE}>경채</option>
              </select>
            </div>
          </div>

          {/* 수강료 + 정원 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                수강료 (원) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                value={form.tuitionFee}
                onChange={(e) => setField("tuitionFee", e.target.value)}
                placeholder="예: 500000"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                정원 (비워두면 무제한)
              </label>
              <input
                type="number"
                min={1}
                value={form.maxCapacity}
                onChange={(e) => setField("maxCapacity", e.target.value)}
                placeholder="예: 30"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
          </div>

          {/* 기수 시작일 + 종료일 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">기수 시작일</label>
              <input
                type="date"
                value={form.cohortStartDate}
                onChange={(e) => setField("cohortStartDate", e.target.value)}
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">기수 종료일</label>
              <input
                type="date"
                value={form.cohortEndDate}
                onChange={(e) => setField("cohortEndDate", e.target.value)}
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
          </div>

          {/* 상태 (수정 모드에서만) */}
          {editingId !== null ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium">상태</label>
              <select
                value={form.editStatus ?? CourseStatus.ACTIVE}
                onChange={(e) => setField("editStatus", e.target.value as CourseStatus)}
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              >
                {(Object.keys(STATUS_LABELS) as CourseStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* 설명 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">설명 (선택)</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="강좌에 대한 간략한 설명을 입력하세요."
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30 resize-none"
            />
          </div>
        </div>
      </ActionModal>

      {/* Delete confirm modal */}
      <ActionModal
        open={Boolean(confirmModal.modal)}
        badgeLabel={confirmModal.modal?.badgeLabel ?? ""}
        badgeTone={confirmModal.modal?.badgeTone}
        title={confirmModal.modal?.title ?? ""}
        description={confirmModal.modal?.description ?? ""}
        details={confirmModal.modal?.details ?? []}
        cancelLabel={confirmModal.modal?.cancelLabel}
        confirmLabel={confirmModal.modal?.confirmLabel ?? "확인"}
        confirmTone={confirmModal.modal?.confirmTone}
        isPending={isPending}
        onClose={confirmModal.closeModal}
        onConfirm={confirmModal.modal?.onConfirm}
      />
    </div>
  );
}
