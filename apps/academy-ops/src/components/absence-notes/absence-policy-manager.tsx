"use client";

import { AbsenceCategory } from "@prisma/client";
import { ActionModal } from "@/components/ui/action-modal";
import { useActionModalState } from "@/components/ui/use-action-modal-state";
import { ABSENCE_CATEGORY_LABEL } from "@/lib/constants";
import { useMemo, useState, useTransition } from "react";

type AbsencePolicyRecord = {
  id: number;
  name: string;
  absenceCategory: AbsenceCategory;
  attendCountsAsAttendance: boolean;
  attendGrantsPerfectAttendance: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type AbsencePolicyManagerProps = {
  policies: AbsencePolicyRecord[];
};

const EMPTY_FORM = {
  name: "",
  absenceCategory: AbsenceCategory.OTHER,
  attendCountsAsAttendance: false,
  attendGrantsPerfectAttendance: false,
  isActive: true,
  sortOrder: 0,
};

export function AbsencePolicyManager({ policies }: AbsencePolicyManagerProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState(EMPTY_FORM.name);
  const [absenceCategory, setAbsenceCategory] = useState<AbsenceCategory>(EMPTY_FORM.absenceCategory);
  const [attendCountsAsAttendance, setAttendCountsAsAttendance] = useState(EMPTY_FORM.attendCountsAsAttendance);
  const [attendGrantsPerfectAttendance, setAttendGrantsPerfectAttendance] = useState(EMPTY_FORM.attendGrantsPerfectAttendance);
  const [isActive, setIsActive] = useState(EMPTY_FORM.isActive);
  const [sortOrder, setSortOrder] = useState(String(EMPTY_FORM.sortOrder));
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmModal = useActionModalState();
  const completionModal = useActionModalState();

  const sortedPolicies = useMemo(
    () => [...policies].sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id),
    [policies],
  );

  const militaryLocked = absenceCategory === AbsenceCategory.MILITARY;
  const effectiveCountsAsAttendance = militaryLocked
    ? true
    : attendCountsAsAttendance || attendGrantsPerfectAttendance;
  const effectivePerfectAttendance = militaryLocked ? true : attendGrantsPerfectAttendance;

  function resetForm() {
    setEditingId(null);
    setName(EMPTY_FORM.name);
    setAbsenceCategory(EMPTY_FORM.absenceCategory);
    setAttendCountsAsAttendance(EMPTY_FORM.attendCountsAsAttendance);
    setAttendGrantsPerfectAttendance(EMPTY_FORM.attendGrantsPerfectAttendance);
    setIsActive(EMPTY_FORM.isActive);
    setSortOrder(String(EMPTY_FORM.sortOrder));
  }

  async function requestJson(url: string, init?: RequestInit) {
    const response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "요청에 실패했습니다.");
    }
    return payload;
  }

  function openCompletionModal(title: string, description: string, details: string[] = []) {
    completionModal.openModal({
      badgeLabel: "처리 완료",
      badgeTone: "success",
      title,
      description,
      details,
      confirmLabel: "확인",
      onClose: () => window.location.reload(),
    });
  }

  function submitPolicy() {
    setMessage(null);
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await requestJson(editingId ? `/api/absence-policies/${editingId}` : "/api/absence-policies", {
          method: editingId ? "PUT" : "POST",
          body: JSON.stringify({
            name,
            absenceCategory,
            attendCountsAsAttendance: effectiveCountsAsAttendance,
            attendGrantsPerfectAttendance: effectivePerfectAttendance,
            isActive,
            sortOrder: Number(sortOrder || 0),
          }),
        });
        resetForm();
        setMessage(null);
        setErrorMessage(null);
        openCompletionModal(
          editingId ? "정책 수정 완료" : "정책 추가 완료",
          editingId ? "사유 정책을 수정했습니다." : "사유 정책을 추가했습니다.",
          [name],
        );
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "정책 저장에 실패했습니다.");
      }
    });
  }

  function editPolicy(policy: AbsencePolicyRecord) {
    setEditingId(policy.id);
    setName(policy.name);
    setAbsenceCategory(policy.absenceCategory);
    setAttendCountsAsAttendance(policy.attendCountsAsAttendance);
    setAttendGrantsPerfectAttendance(policy.attendGrantsPerfectAttendance);
    setIsActive(policy.isActive);
    setSortOrder(String(policy.sortOrder));
    setMessage(null);
    setErrorMessage(null);
  }

  function removePolicy(policy: AbsencePolicyRecord) {
    confirmModal.openModal({
      badgeLabel: "삭제 확인",
      badgeTone: "warning",
      title: "정책 삭제",
      description: `정책 "${policy.name}"을 삭제하시겠습니까?`,
      details: ["삭제 후에는 새 사유서 등록 시 이 정책을 더 이상 선택할 수 없습니다."],
      cancelLabel: "취소",
      confirmLabel: "삭제",
      confirmTone: "danger",
      onConfirm: () => {
        confirmModal.closeModal();
        setMessage(null);
        setErrorMessage(null);
        startTransition(async () => {
          try {
            await requestJson(`/api/absence-policies/${policy.id}`, {
              method: "DELETE",
            });
            if (editingId === policy.id) {
              resetForm();
            }
            openCompletionModal(
              "정책 삭제 완료",
              "사유 정책을 삭제했습니다.",
              [policy.name],
            );
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "정책 삭제에 실패했습니다.");
          }
        });
      },
    });
  }

  return (
    <section className="rounded-[28px] border border-ink/10 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">사유 정책</h2>
          <p className="mt-2 text-sm leading-7 text-slate">
            자주 쓰는 사유별 기본 처리 규칙입니다. 사유서 등록 시 정책을 선택하면 출석 포함과 개근 인정 값이 자동으로 채워집니다.
          </p>
        </div>
        <span className="inline-flex rounded-full border border-ink/10 px-3 py-1 text-xs font-semibold text-slate">
          활성 정책 {policies.filter((policy) => policy.isActive).length}개
        </span>
      </div>

      {message ? (
        <div className="mt-4 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest">{message}</div>
      ) : null}
      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr,1.8fr]">
        <div className="rounded-[24px] border border-ink/10 bg-mist p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold">{editingId ? "정책 수정" : "정책 추가"}</h3>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="text-sm font-medium text-slate transition hover:text-ink"
              >
                새 정책으로 전환
              </button>
            ) : null}
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">정책 이름</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                placeholder="예: 예비군, 입원, 가족 행사"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium">사유 유형</label>
                <select
                  value={absenceCategory}
                  onChange={(event) => {
                    const nextCategory = event.target.value as AbsenceCategory;
                    setAbsenceCategory(nextCategory);
                    if (nextCategory === AbsenceCategory.MILITARY) {
                      setAttendCountsAsAttendance(true);
                      setAttendGrantsPerfectAttendance(true);
                    }
                  }}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                >
                  {Object.values(AbsenceCategory).map((category) => (
                    <option key={category} value={category}>
                      {ABSENCE_CATEGORY_LABEL[category]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">정렬 순서</label>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value)}
                  className="w-full rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${militaryLocked ? "border-amber-200 bg-amber-50 text-amber-700" : "border-ink/10 bg-white"}`}>
                <input
                  type="checkbox"
                  checked={effectiveCountsAsAttendance}
                  disabled={militaryLocked || effectivePerfectAttendance}
                  onChange={(event) => setAttendCountsAsAttendance(event.target.checked)}
                  className="h-4 w-4"
                />
                출석 포함
                {militaryLocked ? <span className="text-xs">(자동)</span> : null}
              </label>

              <label className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${militaryLocked ? "border-amber-200 bg-amber-50 text-amber-700" : "border-ink/10 bg-white"}`}>
                <input
                  type="checkbox"
                  checked={effectivePerfectAttendance}
                  disabled={militaryLocked}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setAttendGrantsPerfectAttendance(checked);
                    if (checked) {
                      setAttendCountsAsAttendance(true);
                    }
                  }}
                  className="h-4 w-4"
                />
                개근 인정
                {militaryLocked ? <span className="text-xs">(자동)</span> : null}
              </label>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-slate">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                className="h-4 w-4"
              />
              활성 정책으로 사용
            </label>

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={submitPolicy}
                disabled={isPending}
                className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest disabled:cursor-not-allowed disabled:bg-ink/40"
              >
                {editingId ? "정책 수정" : "정책 추가"}
              </button>
              {editingId ? (
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isPending}
                  className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember disabled:cursor-not-allowed disabled:opacity-40"
                >
                  취소
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-[24px] border border-ink/10">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-mist text-left text-xs uppercase tracking-[0.18em] text-slate">
                <tr>
                  <th className="px-4 py-3">정책</th>
                  <th className="px-4 py-3">유형</th>
                  <th className="px-4 py-3 text-center">출석</th>
                  <th className="px-4 py-3 text-center">개근</th>
                  <th className="px-4 py-3 text-center">상태</th>
                  <th className="px-4 py-3 text-right">관리</th>
                </tr>
              </thead>
              <tbody>
                {sortedPolicies.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-slate">
                      등록된 정책이 없습니다. 자주 쓰는 사유를 먼저 정책으로 만들어 두면 등록이 빨라집니다.
                    </td>
                  </tr>
                ) : (
                  sortedPolicies.map((policy) => (
                    <tr key={policy.id} className="border-t border-ink/10 bg-white">
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{policy.name}</div>
                        <div className="text-xs text-slate">순서 {policy.sortOrder}</div>
                      </td>
                      <td className="px-4 py-3 text-slate">{ABSENCE_CATEGORY_LABEL[policy.absenceCategory]}</td>
                      <td className="px-4 py-3 text-center">
                        {policy.attendCountsAsAttendance ? (
                          <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">포함</span>
                        ) : (
                          <span className="text-slate">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {policy.attendGrantsPerfectAttendance ? (
                          <span className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest">인정</span>
                        ) : (
                          <span className="text-slate">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${policy.isActive ? "border-forest/20 bg-forest/10 text-forest" : "border-ink/10 bg-mist text-slate"}`}>
                          {policy.isActive ? "활성" : "비활성"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => editPolicy(policy)}
                            className="inline-flex items-center rounded-full border border-ink/10 px-3 py-1.5 text-xs font-semibold transition hover:border-ember/30 hover:text-ember"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => removePolicy(policy)}
                            className="inline-flex items-center rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
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
      <ActionModal
        open={Boolean(completionModal.modal)}
        badgeLabel={completionModal.modal?.badgeLabel ?? ""}
        badgeTone={completionModal.modal?.badgeTone}
        title={completionModal.modal?.title ?? ""}
        description={completionModal.modal?.description ?? ""}
        details={completionModal.modal?.details ?? []}
        confirmLabel={completionModal.modal?.confirmLabel ?? "확인"}
        onClose={completionModal.closeModal}
        onConfirm={completionModal.modal?.onConfirm}
      />
    </section>
  );
}