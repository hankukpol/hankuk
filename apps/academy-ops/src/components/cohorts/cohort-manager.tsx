"use client";

import { ExamCategory } from "@prisma/client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import { EXAM_CATEGORY_LABEL } from "@/lib/constants";

type CohortRecord = {
  id: string;
  name: string;
  examCategory: ExamCategory;
  startDate: string;
  endDate: string;
  targetExamYear: number | null;
  maxCapacity: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  activeCount: number;
  waitlistCount: number;
};

type CohortManagerProps = {
  initialCohorts: CohortRecord[];
};

type FormState = {
  name: string;
  examCategory: ExamCategory;
  startDate: string;
  endDate: string;
  targetExamYear: string;
  maxCapacity: string;
  isActive: boolean;
};

const DEFAULT_FORM: FormState = {
  name: "",
  examCategory: ExamCategory.GONGCHAE,
  startDate: "",
  endDate: "",
  targetExamYear: "",
  maxCapacity: "",
  isActive: true,
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

const EXAM_CATEGORY_FILTERS: Array<{ value: ExamCategory | "ALL"; label: string }> = [
  { value: "ALL", label: "전체" },
  { value: ExamCategory.GONGCHAE, label: EXAM_CATEGORY_LABEL[ExamCategory.GONGCHAE] },
  { value: ExamCategory.GYEONGCHAE, label: EXAM_CATEGORY_LABEL[ExamCategory.GYEONGCHAE] },
  { value: ExamCategory.SOGANG, label: EXAM_CATEGORY_LABEL[ExamCategory.SOGANG] },
  { value: ExamCategory.CUSTOM, label: EXAM_CATEGORY_LABEL[ExamCategory.CUSTOM] },
];

export function CohortManager({ initialCohorts }: CohortManagerProps) {
  const [cohorts, setCohorts] = useState<CohortRecord[]>(initialCohorts);
  const [filterCategory, setFilterCategory] = useState<ExamCategory | "ALL">("ALL");
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();

  const filteredCohorts = cohorts.filter((cohort) => {
    if (filterCategory !== "ALL" && cohort.examCategory !== filterCategory) return false;
    return true;
  });

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  }

  function openEdit(cohort: CohortRecord) {
    setEditingId(cohort.id);
    setForm({
      name: cohort.name,
      examCategory: cohort.examCategory,
      startDate: cohort.startDate.slice(0, 10),
      endDate: cohort.endDate.slice(0, 10),
      targetExamYear: cohort.targetExamYear != null ? String(cohort.targetExamYear) : "",
      maxCapacity: cohort.maxCapacity != null ? String(cohort.maxCapacity) : "",
      isActive: cohort.isActive,
    });
    setErrorMessage(null);
    setSuccessMessage(null);
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
    setSuccessMessage(null);

    startTransition(async () => {
      try {
        const body = {
          name: form.name,
          examCategory: form.examCategory,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          targetExamYear: form.targetExamYear ? Number(form.targetExamYear) : null,
          maxCapacity: form.maxCapacity ? Number(form.maxCapacity) : null,
          isActive: form.isActive,
        };

        if (editingId !== null) {
          const result = await requestJson<{ cohort: Omit<CohortRecord, "activeCount" | "waitlistCount"> }>(
            `/api/settings/cohorts/${editingId}`,
            { method: "PATCH", body: JSON.stringify(body) },
          );
          setCohorts((prev) =>
            prev.map((c) =>
              c.id === editingId
                ? { ...result.cohort, activeCount: c.activeCount, waitlistCount: c.waitlistCount }
                : c,
            ),
          );
          setSuccessMessage("기수를 수정했습니다.");
        } else {
          const result = await requestJson<{ cohort: Omit<CohortRecord, "activeCount" | "waitlistCount"> }>(
            "/api/settings/cohorts",
            { method: "POST", body: JSON.stringify(body) },
          );
          setCohorts((prev) => [{ ...result.cohort, activeCount: 0, waitlistCount: 0 }, ...prev]);
          setSuccessMessage("기수를 추가했습니다.");
        }

        closeForm();
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "저장에 실패했습니다.",
        );
      }
    });
  }

  function handleDelete(cohort: CohortRecord) {
    confirmModal.openModal({
      badgeLabel: "삭제 확인",
      badgeTone: "warning",
      title: `기수 삭제: ${cohort.name}`,
      description: "이 기수를 삭제하시겠습니까? 삭제한 기수는 다시 복구할 수 없습니다.",
      details: [
        `기수명: ${cohort.name}`,
        `수험유형: ${EXAM_CATEGORY_LABEL[cohort.examCategory]}`,
        `기간: ${formatDate(cohort.startDate)} ~ ${formatDate(cohort.endDate)}`,
      ],
      cancelLabel: "취소",
      confirmLabel: "삭제",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setSuccessMessage(null);
        setErrorMessage(null);

        startTransition(async () => {
          try {
            await requestJson<{ success: true }>(`/api/settings/cohorts/${cohort.id}`, {
              method: "DELETE",
            });
            setCohorts((prev) => prev.filter((c) => c.id !== cohort.id));
            setSuccessMessage("기수를 삭제했습니다.");
          } catch (error) {
            setErrorMessage(
              error instanceof Error ? error.message : "삭제에 실패했습니다.",
            );
          }
        });
      },
    });
  }

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1">
          {EXAM_CATEGORY_FILTERS.map((f) => (
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
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-full bg-ember px-4 py-2 text-sm font-medium text-white transition hover:bg-ember/90"
        >
          <span>+</span>
          <span>새 기수 추가</span>
        </button>
      </div>

      {/* Messages */}
      {successMessage ? (
        <div className="rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">
          {successMessage}
        </div>
      ) : null}
      {errorMessage && !isFormOpen ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {/* Table */}
      <div className="overflow-hidden rounded-[28px] border border-ink/10 bg-white">
        <table className="min-w-full divide-y divide-ink/10 text-sm">
          <thead>
            <tr>
              {["기수명", "수험유형", "시작일", "종료일", "목표시험연도", "정원 현황", "상태", "액션"].map(
                (header) => (
                  <th
                    key={header}
                    className="bg-mist/50 px-4 py-3 text-left text-xs font-medium uppercase text-slate"
                  >
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {filteredCohorts.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate">
                  조건에 맞는 기수가 없습니다.
                </td>
              </tr>
            ) : null}
            {filteredCohorts.map((cohort) => (
              <tr key={cohort.id} className="transition hover:bg-mist/30">
                <td className="px-4 py-3 font-medium text-ink">{cohort.name}</td>
                <td className="px-4 py-3 text-slate">
                  {EXAM_CATEGORY_LABEL[cohort.examCategory]}
                </td>
                <td className="px-4 py-3 text-xs text-slate">{formatDate(cohort.startDate)}</td>
                <td className="px-4 py-3 text-xs text-slate">{formatDate(cohort.endDate)}</td>
                <td className="px-4 py-3 text-slate">
                  {cohort.targetExamYear != null ? `${cohort.targetExamYear}년` : "-"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-slate">
                      {cohort.maxCapacity != null
                        ? `${cohort.activeCount}/${cohort.maxCapacity}명`
                        : `${cohort.activeCount}명 (무제한)`}
                    </span>
                    {cohort.waitlistCount > 0 ? (
                      <Link
                        href={`/admin/settings/cohorts/${cohort.id}`}
                        className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-200"
                      >
                        대기 {cohort.waitlistCount}명
                      </Link>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      cohort.isActive
                        ? "bg-forest/10 text-forest"
                        : "bg-slate/10 text-slate"
                    }`}
                  >
                    {cohort.isActive ? "활성" : "비활성"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link
                      href={`/admin/settings/cohorts/${cohort.id}`}
                      className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-forest/30 hover:text-forest"
                    >
                      상세
                    </Link>
                    <button
                      type="button"
                      onClick={() => openEdit(cohort)}
                      disabled={isPending}
                      className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(cohort)}
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
        badgeLabel={editingId !== null ? "기수 수정" : "기수 추가"}
        badgeTone="default"
        title={editingId !== null ? "기수 수정" : "새 기수 추가"}
        description={
          editingId !== null
            ? "기수 정보를 수정합니다."
            : "새 기수를 등록합니다. 기수명, 수험유형, 시작일·종료일은 필수 항목입니다."
        }
        panelClassName="max-w-lg"
        cancelLabel="취소"
        confirmLabel={isPending ? "저장 중..." : editingId !== null ? "수정 저장" : "기수 추가"}
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

          {/* 기수명 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              기수명 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="예: 2026 공채 1기"
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
            />
          </div>

          {/* 수험유형 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              수험유형 <span className="text-red-500">*</span>
            </label>
            <select
              value={form.examCategory}
              onChange={(e) => setField("examCategory", e.target.value as ExamCategory)}
              className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
            >
              {(Object.keys(EXAM_CATEGORY_LABEL) as ExamCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {EXAM_CATEGORY_LABEL[cat]}
                </option>
              ))}
            </select>
          </div>

          {/* 시작일 + 종료일 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                시작일 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setField("startDate", e.target.value)}
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">
                종료일 <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setField("endDate", e.target.value)}
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
          </div>

          {/* 목표시험연도 + 정원 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">목표시험연도 (선택)</label>
              <input
                type="number"
                min={2020}
                max={2099}
                value={form.targetExamYear}
                onChange={(e) => setField("targetExamYear", e.target.value)}
                placeholder="예: 2027"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">정원 (선택)</label>
              <input
                type="number"
                min={1}
                value={form.maxCapacity}
                onChange={(e) => setField("maxCapacity", e.target.value)}
                placeholder="무제한"
                className="w-full rounded-2xl border border-ink/10 px-4 py-3 text-sm outline-none focus:border-ink/30"
              />
            </div>
          </div>

          {/* 활성여부 */}
          <div className="flex items-center gap-3">
            <input
              id="cohort-is-active"
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setField("isActive", e.target.checked)}
              className="h-4 w-4 rounded border-ink/20 accent-ember"
            />
            <label htmlFor="cohort-is-active" className="text-sm font-medium">
              활성 기수로 설정
            </label>
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
