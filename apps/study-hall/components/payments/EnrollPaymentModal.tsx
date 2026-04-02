"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { toast } from "@/lib/sonner";

import {
  createPaymentEntryFormValue,
  PaymentEntriesEditor,
  type PaymentEntryFormValue,
} from "@/components/payments/PaymentEntriesEditor";
import { findDefaultPaymentCategoryId, getKstToday } from "@/components/payments/payment-client-helpers";
import { ActionCompleteModal } from "@/components/ui/ActionCompleteModal";
import { Modal } from "@/components/ui/Modal";
import { formatCurrency } from "@/lib/payment-meta";
import type { PaymentCategoryItem } from "@/lib/services/payment.service";
import type { StudentListItem } from "@/lib/services/student.service";
import type { TuitionPlanItem } from "@/lib/services/tuition-plan.service";
import { calculateCourseEndDate } from "@/lib/tuition-meta";

type EnrollPaymentModalProps = {
  open: boolean;
  onClose: () => void;
  divisionSlug: string;
  students: StudentListItem[];
  paymentCategories: PaymentCategoryItem[];
  tuitionPlans: TuitionPlanItem[];
  onSuccess: () => void | Promise<void>;
  onRequestRenew: (studentId: string) => void;
};

type FormState = {
  search: string;
  name: string;
  studentNumber: string;
  phone: string;
  memo: string;
  tuitionExempt: boolean;
  tuitionExemptReason: string;
  tuitionPlanId: string;
  tuitionAmount: string;
  courseStartDate: string;
  payments: PaymentEntryFormValue[];
};

function createInitialState(paymentCategories: PaymentCategoryItem[], tuitionPlans: TuitionPlanItem[]): FormState {
  const defaultPlanId = tuitionPlans[0]?.id ?? "";
  const defaultPlan = tuitionPlans.find((plan) => plan.id === defaultPlanId) ?? null;
  const defaultPaymentTypeId = findDefaultPaymentCategoryId(paymentCategories, ["등록비", "월납부"]);

  return {
    search: "",
    name: "",
    studentNumber: "",
    phone: "",
    memo: "",
    tuitionExempt: false,
    tuitionExemptReason: "",
    tuitionPlanId: defaultPlanId,
    tuitionAmount: defaultPlan ? String(defaultPlan.amount) : "",
    courseStartDate: getKstToday(),
    payments: [
      createPaymentEntryFormValue({
        paymentTypeId: defaultPaymentTypeId,
        amount: defaultPlan ? String(defaultPlan.amount) : "",
        paymentDate: getKstToday(),
        method: "card",
        notes: defaultPlan?.name ?? "",
      }),
    ],
  };
}

function toPaymentPayload(entries: PaymentEntryFormValue[]) {
  return entries.map((entry) => ({
    paymentTypeId: entry.paymentTypeId,
    amount: Number(entry.amount),
    paymentDate: entry.paymentDate,
    method: entry.method,
    notes: entry.notes || null,
  }));
}

export function EnrollPaymentModal({
  open,
  onClose,
  divisionSlug,
  students,
  paymentCategories,
  tuitionPlans,
  onSuccess,
  onRequestRenew,
}: EnrollPaymentModalProps) {
  const [form, setForm] = useState<FormState>(() => createInitialState(paymentCategories, tuitionPlans));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveSuccessModal, setSaveSuccessModal] = useState<{
    title: string;
    description: string;
    notice?: string;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(createInitialState(paymentCategories, tuitionPlans));
    setIsSubmitting(false);
    setSaveSuccessModal(null);
  }, [open, paymentCategories, tuitionPlans]);

  const activeStudents = useMemo(
    () => students.filter((student) => student.status === "ACTIVE" || student.status === "ON_LEAVE"),
    [students],
  );

  const existingMatches = useMemo(() => {
    const keyword = form.search.trim().toLowerCase();

    if (!keyword) {
      return [];
    }

    return activeStudents
      .filter(
        (student) =>
          student.name.toLowerCase().includes(keyword) ||
          student.studentNumber.toLowerCase().includes(keyword),
      )
      .slice(0, 6);
  }, [activeStudents, form.search]);

  const selectedPlan = tuitionPlans.find((plan) => plan.id === form.tuitionPlanId) ?? null;
  const computedCourseEndDate =
    form.courseStartDate && selectedPlan?.durationDays
      ? calculateCourseEndDate(form.courseStartDate, selectedPlan.durationDays)
      : null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/payments/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student: {
            name: form.name,
            studentNumber: form.studentNumber,
            phone: form.phone || null,
            memo: form.memo || null,
          },
          tuitionExempt: form.tuitionExempt,
          tuitionExemptReason: form.tuitionExempt ? form.tuitionExemptReason || null : null,
          tuitionPlanId: form.tuitionPlanId,
          tuitionAmount: form.tuitionAmount ? Number(form.tuitionAmount) : null,
          courseStartDate: form.courseStartDate,
          payments: form.tuitionExempt ? undefined : toPaymentPayload(form.payments),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "신규 등록 처리에 실패했습니다.");
      }

      toast.success(form.tuitionExempt ? "학생 등록을 완료했습니다." : "학생 등록과 수납 처리를 완료했습니다.");
      await onSuccess();
      setSaveSuccessModal({
        title: form.tuitionExempt ? "학생 등록 완료" : "등록 및 수납 완료",
        description: form.tuitionExempt
          ? "학생 등록이 저장되어 학생 목록과 수납 화면에 반영되었습니다."
          : "학생 등록과 첫 수납 처리가 저장되었습니다.",
        notice: "등록된 학생 정보와 첫 수납 내역은 현재 화면과 학생 목록에 바로 반영됩니다.",
      });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "신규 등록 처리에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={() => !isSubmitting && onClose()}
        badge="신규 등록"
        title={form.tuitionExempt ? "학생 등록" : "학생 등록과 수납"}
        description={
          form.tuitionExempt
            ? "수납 면제 학생은 결제 없이 등록합니다."
            : "신규 학생 등록과 첫 수납을 한 번에 처리합니다."
        }
      >
        <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-[10px] border border-slate-200 bg-white p-5">
          <div>
            <p className="text-sm font-semibold text-slate-900">기존 학생 확인</p>
            <p className="mt-1 text-sm text-slate-500">
              이름이나 수험번호를 먼저 검색해 중복 등록을 막습니다.
            </p>
          </div>

          <label className="relative mt-4 block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={form.search}
              onChange={(event) => setForm((current) => ({ ...current, search: event.target.value }))}
              className="w-full rounded-[10px] border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400"
              placeholder="이름 또는 수험번호 검색"
            />
          </label>

          {existingMatches.length > 0 ? (
            <div className="mt-4 space-y-2">
              {existingMatches.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => onRequestRenew(student.id)}
                  className="flex w-full items-center justify-between rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-left transition hover:border-amber-300"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{student.name}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      {student.studentNumber}
                      {student.studyTrack ? ` · ${student.studyTrack}` : ""}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-amber-700">연장 수납으로 전환</span>
                </button>
              ))}
            </div>
          ) : form.search.trim() ? (
            <div className="mt-4 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              일치하는 기존 학생이 없습니다. 아래 정보로 신규 등록을 진행합니다.
            </div>
          ) : null}
        </section>

        <section className="rounded-[10px] border border-slate-200 bg-white p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">학생 이름</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                required
                className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">수험번호</span>
              <input
                value={form.studentNumber}
                onChange={(event) =>
                  setForm((current) => ({ ...current, studentNumber: event.target.value }))
                }
                required
                className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">연락처</span>
              <input
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-700">메모</span>
              <textarea
                value={form.memo}
                onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))}
                rows={3}
                className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              />
            </label>
          </div>
        </section>

        <section className="rounded-[10px] border border-slate-200 bg-white p-5">
          <label className="flex items-start gap-3 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4">
            <input
              type="checkbox"
              checked={form.tuitionExempt}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  tuitionExempt: event.target.checked,
                }))
              }
              className="mt-1 h-4 w-4 rounded border-slate-300 accent-sky-600"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">수납 면제</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                장학 또는 운영 예외로 신규 등록 시 결제를 받지 않는 학생이면 체크해 주세요.
              </p>
            </div>
          </label>

          {form.tuitionExempt ? (
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-medium text-slate-700">면제 사유</span>
              <textarea
                value={form.tuitionExemptReason}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    tuitionExemptReason: event.target.value,
                  }))
                }
                rows={3}
                className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                placeholder="예: 장학, 운영 지원"
              />
            </label>
          ) : null}
        </section>

        <section className="rounded-[10px] border border-slate-200 bg-white p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">수강 플랜</span>
              <select
                value={form.tuitionPlanId}
                onChange={(event) => {
                  const nextPlanId = event.target.value;
                  const nextPlan = tuitionPlans.find((plan) => plan.id === nextPlanId) ?? null;

                  setForm((current) => ({
                    ...current,
                    tuitionPlanId: nextPlanId,
                    tuitionAmount: nextPlan ? String(nextPlan.amount) : "",
                    payments:
                      current.payments.length === 1
                        ? [
                            {
                              ...current.payments[0],
                              amount: nextPlan ? String(nextPlan.amount) : "",
                              notes: nextPlan?.name ?? current.payments[0].notes,
                            },
                          ]
                        : current.payments,
                  }));
                }}
                required
                className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              >
                <option value="">플랜 선택</option>
                {tuitionPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {formatCurrency(plan.amount)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">수강 시작일</span>
              <input
                type="date"
                value={form.courseStartDate}
                onChange={(event) =>
                  setForm((current) => ({ ...current, courseStartDate: event.target.value }))
                }
                required
                className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">등록 금액</span>
              <input
                type="number"
                value={form.tuitionAmount}
                onChange={(event) =>
                  setForm((current) => ({ ...current, tuitionAmount: event.target.value }))
                }
                min="0"
                className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              />
            </label>

            <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-700">예상 수강 종료일</p>
              <p className="mt-2 text-lg font-bold text-slate-950">{computedCourseEndDate ?? "자동 계산 없음"}</p>
              <p className="mt-1 text-xs text-slate-500">
                {selectedPlan?.durationDays ? `${selectedPlan.durationDays}일 기준으로 계산합니다.` : "기간 자유 플랜입니다."}
              </p>
            </div>
          </div>
        </section>

        {form.tuitionExempt ? (
          <section className="rounded-[10px] border border-sky-200 bg-sky-50 p-5">
            <p className="text-sm font-semibold text-sky-900">수납 없이 등록합니다.</p>
            <p className="mt-2 text-sm leading-6 text-sky-800">
              면제 학생은 결제 레코드를 만들지 않고 등록만 진행합니다.
            </p>
          </section>
        ) : (
          <PaymentEntriesEditor
            entries={form.payments}
            onChange={(payments) => setForm((current) => ({ ...current, payments }))}
            paymentCategories={paymentCategories}
            disabled={isSubmitting}
            title="결제 정보"
            description="카드와 포인트를 함께 받는 경우 결제 수단 추가로 분할 결제를 등록하세요."
          />
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {form.tuitionExempt ? "등록 완료" : "등록 + 수납 완료"}
          </button>
        </div>
        </form>
      </Modal>

      <ActionCompleteModal
        open={saveSuccessModal !== null}
        onClose={() => setSaveSuccessModal(null)}
        title={saveSuccessModal?.title ?? "저장 완료"}
        description={saveSuccessModal?.description}
        notice={saveSuccessModal?.notice}
      />
    </>
  );
}
