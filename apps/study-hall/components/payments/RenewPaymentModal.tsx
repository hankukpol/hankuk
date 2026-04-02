"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/lib/sonner";

import {
  createPaymentEntryFormValue,
  PaymentEntriesEditor,
  type PaymentEntryFormValue,
} from "@/components/payments/PaymentEntriesEditor";
import { findDefaultPaymentCategoryId, getKstToday } from "@/components/payments/payment-client-helpers";
import { ActionCompleteModal } from "@/components/ui/ActionCompleteModal";
import { Modal } from "@/components/ui/Modal";
import { StudentSearchCombobox } from "@/components/ui/StudentSearchCombobox";
import { formatCurrency } from "@/lib/payment-meta";
import type { PaymentCategoryItem } from "@/lib/services/payment.service";
import type { StudentListItem } from "@/lib/services/student.service";
import type { TuitionPlanItem } from "@/lib/services/tuition-plan.service";
import { addDays } from "@/lib/tuition-meta";

type RenewPaymentModalProps = {
  open: boolean;
  onClose: () => void;
  divisionSlug: string;
  students: StudentListItem[];
  paymentCategories: PaymentCategoryItem[];
  tuitionPlans: TuitionPlanItem[];
  onSuccess: () => void | Promise<void>;
  initialStudentId?: string | null;
};

type FormState = {
  studentId: string;
  tuitionPlanId: string;
  tuitionAmount: string;
  payments: PaymentEntryFormValue[];
};

function createInitialState(
  paymentCategories: PaymentCategoryItem[],
  tuitionPlans: TuitionPlanItem[],
  initialStudentId?: string | null,
): FormState {
  const defaultPlanId = tuitionPlans[0]?.id ?? "";
  const defaultPlan = tuitionPlans.find((plan) => plan.id === defaultPlanId) ?? null;
  const defaultPaymentTypeId = findDefaultPaymentCategoryId(paymentCategories, ["월납부", "등록비"]);

  return {
    studentId: initialStudentId ?? "",
    tuitionPlanId: defaultPlanId,
    tuitionAmount: defaultPlan ? String(defaultPlan.amount) : "",
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

function getRemainingDays(courseEndDate: string | null) {
  if (!courseEndDate) {
    return null;
  }

  const today = getKstToday();
  const diffMs =
    new Date(`${courseEndDate}T00:00:00+09:00`).getTime() -
    new Date(`${today}T00:00:00+09:00`).getTime();

  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
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

export function RenewPaymentModal({
  open,
  onClose,
  divisionSlug,
  students,
  paymentCategories,
  tuitionPlans,
  onSuccess,
  initialStudentId,
}: RenewPaymentModalProps) {
  const [form, setForm] = useState<FormState>(() =>
    createInitialState(paymentCategories, tuitionPlans, initialStudentId),
  );
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

    setForm(createInitialState(paymentCategories, tuitionPlans, initialStudentId));
    setIsSubmitting(false);
    setSaveSuccessModal(null);
  }, [initialStudentId, open, paymentCategories, tuitionPlans]);

  const activeStudents = useMemo(
    () => students.filter((student) => student.status === "ACTIVE" || student.status === "ON_LEAVE"),
    [students],
  );
  const selectedStudent = activeStudents.find((student) => student.id === form.studentId) ?? null;
  const selectedPlan = tuitionPlans.find((plan) => plan.id === form.tuitionPlanId) ?? null;
  const remainingDays = getRemainingDays(selectedStudent?.courseEndDate ?? null);
  const expectedCourseEndDate = useMemo(() => {
    if (!selectedPlan?.durationDays) {
      return selectedStudent?.courseEndDate ?? null;
    }

    const baseDate =
      selectedStudent?.courseEndDate && selectedStudent.courseEndDate >= getKstToday()
        ? selectedStudent.courseEndDate
        : getKstToday();

    return addDays(baseDate, selectedPlan.durationDays);
  }, [selectedPlan?.durationDays, selectedStudent?.courseEndDate]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/${divisionSlug}/payments/renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: form.studentId,
          tuitionPlanId: form.tuitionPlanId,
          tuitionAmount: form.tuitionAmount ? Number(form.tuitionAmount) : null,
          payments: selectedStudent?.tuitionExempt ? undefined : toPaymentPayload(form.payments),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "연장 처리에 실패했습니다.");
      }

      toast.success(
        selectedStudent?.tuitionExempt
          ? "수강 기간 연장을 완료했습니다."
          : "연장 수납과 기간 갱신을 완료했습니다.",
      );
      await onSuccess();
      setSaveSuccessModal({
        title: selectedStudent?.tuitionExempt ? "수강 기간 연장 완료" : "연장 수납 완료",
        description: selectedStudent?.tuitionExempt
          ? "수강 기간 연장이 저장되어 학생 정보에 반영되었습니다."
          : "연장 수납과 수강 기간 갱신이 저장되었습니다.",
        notice: "변경된 수강 기간과 수납 내역은 학생 정보와 수납 현황에 바로 반영됩니다.",
      });
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "연장 처리에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={() => !isSubmitting && onClose()}
        badge="연장 등록"
        title={selectedStudent?.tuitionExempt ? "수강 기간 연장" : "연장 수납"}
        description={
          selectedStudent?.tuitionExempt
            ? "면제 학생은 결제 없이 기간만 연장합니다."
            : "기존 학생의 수강 기간을 연장하고 결제를 함께 기록합니다."
        }
      >
        <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-[10px] border border-slate-200 bg-white p-5">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">학생 선택</span>
            <StudentSearchCombobox
              students={activeStudents}
              value={form.studentId}
              onChange={(studentId) => setForm((current) => ({ ...current, studentId }))}
              placeholder="이름 또는 수험번호 검색"
              showStudyTrack
            />
          </label>

          {selectedStudent ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-medium text-slate-700">현재 수강 정보</p>
                <p className="mt-2 text-base font-semibold text-slate-950">
                  {selectedStudent.tuitionPlanName || "직접 입력"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {selectedStudent.courseStartDate || "-"} ~ {selectedStudent.courseEndDate || "-"}
                </p>
              </div>

              <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-medium text-slate-700">남은 기간</p>
                <p className="mt-2 text-base font-semibold text-slate-950">
                  {remainingDays == null
                    ? "정보 없음"
                    : remainingDays >= 0
                      ? `${remainingDays}일`
                      : `${Math.abs(remainingDays)}일 경과`}
                </p>
                <p className="mt-1 text-sm text-slate-600">현재 종료일 기준으로 계산합니다.</p>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              연장할 학생을 먼저 선택해 주세요.
            </div>
          )}

          {selectedStudent?.tuitionExempt ? (
            <div className="mt-4 rounded-[10px] border border-sky-200 bg-sky-50 px-4 py-4 text-sm leading-6 text-sky-900">
              <p className="font-semibold">수납 면제 학생</p>
              <p className="mt-1">
                {selectedStudent.tuitionExemptReason || "면제 사유가 아직 입력되지 않았습니다."}
              </p>
            </div>
          ) : null}
        </section>

        <section className="rounded-[10px] border border-slate-200 bg-white p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">연장 플랜</span>
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
              <span className="mb-2 block text-sm font-medium text-slate-700">연장 금액</span>
              <input
                type="number"
                value={form.tuitionAmount}
                onChange={(event) => setForm((current) => ({ ...current, tuitionAmount: event.target.value }))}
                min="0"
                className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              />
            </label>

            <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2">
              <p className="text-sm font-medium text-slate-700">예상 종료일</p>
              <p className="mt-2 text-lg font-bold text-slate-950">{expectedCourseEndDate ?? "계산할 수 없음"}</p>
              <p className="mt-1 text-xs text-slate-500">
                현재 종료일이 남아 있으면 그 날짜부터 연장하고, 지났다면 오늘부터 다시 계산합니다.
              </p>
            </div>
          </div>
        </section>

        {selectedStudent?.tuitionExempt ? (
          <section className="rounded-[10px] border border-sky-200 bg-sky-50 p-5">
            <p className="text-sm font-semibold text-sky-900">수납 없이 연장합니다.</p>
            <p className="mt-2 text-sm leading-6 text-sky-800">
              면제 학생은 결제 레코드를 만들지 않고 종료일만 갱신합니다.
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
            disabled={isSubmitting || !form.studentId}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--division-color)] px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            {selectedStudent?.tuitionExempt ? "연장 완료" : "연장 수납 완료"}
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
