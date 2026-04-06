"use client";

import { LoaderCircle, Pencil, RefreshCcw, Save, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "@/lib/sonner";

import { useActionCompleteModal } from "@/components/ui/useActionCompleteModal";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";
import type { TuitionPlanItem } from "@/lib/services/tuition-plan.service";

type TuitionPlanManagerProps = {
  divisionSlug: string;
  initialPlans: TuitionPlanItem[];
};

type FormState = {
  name: string;
  durationDays: string;
  amount: string;
  description: string;
  isActive: boolean;
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("ko-KR").format(amount);
}

function toFormState(plan?: TuitionPlanItem | null): FormState {
  return {
    name: plan?.name ?? "",
    durationDays: plan?.durationDays ? String(plan.durationDays) : "",
    amount: plan ? String(plan.amount) : "",
    description: plan?.description ?? "",
    isActive: plan?.isActive ?? true,
  };
}

export function TuitionPlanManager({ divisionSlug, initialPlans }: TuitionPlanManagerProps) {
  const [plans, setPlans] = useState(initialPlans);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(toFormState());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const { showActionComplete, actionCompleteModal } = useActionCompleteModal();
  const { confirm, confirmDialog } = useConfirmDialog();

  const sortedPlans = useMemo(
    () =>
      [...plans].sort(
        (left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name, "ko"),
      ),
    [plans],
  );

  async function refreshPlans(showToast = false) {
    setIsRefreshing(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/tuition-plans`, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "등록 플랜 목록을 불러오지 못했습니다.");
      }

      setPlans(data.plans);

      if (showToast) {
        toast.success("등록 플랜을 새로 불러왔습니다.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "등록 플랜 목록을 불러오지 못했습니다.");
    } finally {
      setIsRefreshing(false);
    }
  }

  function startEdit(plan: TuitionPlanItem) {
    setEditingPlanId(plan.id);
    setForm(toFormState(plan));
  }

  function resetForm() {
    setEditingPlanId(null);
    setForm(toFormState());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch(
        editingPlanId ? `/api/${divisionSlug}/tuition-plans/${editingPlanId}` : `/api/${divisionSlug}/tuition-plans`,
        {
          method: editingPlanId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: form.name,
            durationDays: form.durationDays ? Number(form.durationDays) : null,
            amount: Number(form.amount),
            description: form.description || null,
            isActive: form.isActive,
          }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "등록 플랜 저장에 실패했습니다.");
      }

      await refreshPlans();
      resetForm();
      toast.success(editingPlanId ? "등록 플랜을 수정했습니다." : "등록 플랜을 추가했습니다.");
      showActionComplete({
        title: editingPlanId ? "등록 플랜 수정 완료" : "등록 플랜 추가 완료",
        description: editingPlanId
          ? "등록 플랜 정보가 수정되었습니다."
          : "새 등록 플랜이 추가되었습니다.",
        notice: "저장한 플랜은 학생 등록과 연장 수납 화면에서 바로 사용할 수 있습니다.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "등록 플랜 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(planId: string) {
    const confirmed = await confirm({
      title: "등록 플랜 삭제",
      description: "이 등록 플랜을 삭제하시겠습니까?",
      confirmLabel: "삭제",
      variant: "danger",
    });

    if (!confirmed) {
      return;
    }

    setIsDeletingId(planId);

    try {
      const response = await fetch(`/api/${divisionSlug}/tuition-plans/${planId}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "등록 플랜 삭제에 실패했습니다.");
      }

      await refreshPlans();

      if (editingPlanId === planId) {
        resetForm();
      }

      toast.success("등록 플랜을 삭제했습니다.");
      showActionComplete({
        title: "등록 플랜 삭제 완료",
        description: "선택한 등록 플랜이 삭제되었습니다.",
        notice: "삭제한 플랜은 이후 등록/연장 화면에서 선택할 수 없습니다.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "등록 플랜 삭제에 실패했습니다.");
    } finally {
      setIsDeletingId(null);
    }
  }

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <section className="rounded-[10px] border border-black/5 bg-white p-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
              등록 플랜
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-950">등록 기간 / 금액 설정</h2>
          </div>

          <button
            type="button"
            onClick={() => refreshPlans(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {isRefreshing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            새로고침
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          {sortedPlans.length > 0 ? (
            sortedPlans.map((plan) => (
              <article key={plan.id} className="rounded-[10px] border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-slate-950">{plan.name}</h3>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          plan.isActive
                            ? "border border-slate-200 bg-white text-emerald-700"
                            : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {plan.isActive ? "사용 중" : "비활성"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      기간 {plan.durationDays ? `${plan.durationDays}일` : "자유 설정"} · 금액{" "}
                      {formatCurrency(plan.amount)}원
                    </p>
                    {plan.description ? <p className="mt-2 text-sm text-slate-500">{plan.description}</p> : null}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(plan)}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white"
                    >
                      <Pencil className="h-4 w-4" />
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(plan.id)}
                      disabled={isDeletingId === plan.id}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-white disabled:opacity-60"
                    >
                      {isDeletingId === plan.id ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      삭제
                    </button>
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-[10px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-600">
              등록된 플랜이 없습니다. 오른쪽에서 새 플랜을 추가해 주세요.
            </div>
          )}
        </div>
        </section>

        <section className="rounded-[10px] border border-black/5 bg-white p-6 shadow-[0_16px_40px_rgba(18,32,56,0.06)]">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">플랜 편집</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">
          {editingPlanId ? "등록 플랜 수정" : "등록 플랜 추가"}
        </h2>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">플랜 이름</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              placeholder="예: 4주반"
              required
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">기간 일수</span>
              <input
                type="number"
                min={1}
                value={form.durationDays}
                onChange={(event) => setForm((current) => ({ ...current, durationDays: event.target.value }))}
                className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="예: 28"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">금액</span>
              <input
                type="number"
                min={0}
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="예: 320000"
                required
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">설명</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              className="min-h-[120px] w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              placeholder="학생 등록 화면에서 참고할 안내 문구를 적어 둘 수 있습니다."
            />
          </label>

          <label className="flex items-center justify-between rounded-[10px] border border-slate-200 bg-white px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-slate-800">사용 여부</span>
              <span className="block text-xs text-slate-500">
                비활성 플랜은 학생 등록 화면의 기본 목록에서 숨겨집니다.
              </span>
            </span>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              className="h-5 w-5 rounded border-slate-300"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingPlanId ? "플랜 저장" : "플랜 추가"}
            </button>

            {editingPlanId ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                편집 취소
              </button>
            ) : null}
          </div>
        </form>
        </section>
      </div>
      {confirmDialog}
      {actionCompleteModal}
    </>
  );
}
