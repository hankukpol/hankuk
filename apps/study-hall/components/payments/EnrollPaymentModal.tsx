"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Search } from "lucide-react";
import { toast } from "sonner";

import { PaymentMethodSelect } from "@/components/payments/PaymentMethodSelect";
import { findDefaultPaymentCategoryId, getKstToday } from "@/components/payments/payment-client-helpers";
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
  paymentTypeId: string;
  paymentAmount: string;
  paymentDate: string;
  paymentMethod: string;
  paymentNotes: string;
};

function createInitialState(paymentCategories: PaymentCategoryItem[], tuitionPlans: TuitionPlanItem[]): FormState {
  const defaultPlanId = tuitionPlans[0]?.id ?? "";
  const defaultPlan = tuitionPlans.find((plan) => plan.id === defaultPlanId) ?? null;

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
    paymentTypeId: findDefaultPaymentCategoryId(paymentCategories, ["등록비", "월납부"]),
    paymentAmount: defaultPlan ? String(defaultPlan.amount) : "",
    paymentDate: getKstToday(),
    paymentMethod: "card",
    paymentNotes: defaultPlan?.name ?? "",
  };
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

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(createInitialState(paymentCategories, tuitionPlans));
    setIsSubmitting(false);
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
          payment: form.tuitionExempt
            ? undefined
            : {
                paymentTypeId: form.paymentTypeId,
                amount: Number(form.paymentAmount),
                paymentDate: form.paymentDate,
                method: form.paymentMethod,
                notes: form.paymentNotes || null,
              },
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "신규 등록 처리에 실패했습니다.");
      }

      toast.success(form.tuitionExempt ? "학생 등록이 완료되었습니다." : "학생 등록과 수납 처리가 완료되었습니다.");
      await onSuccess();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "신규 등록 처리에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !isSubmitting && onClose()}
      badge="신규 등록"
      title={form.tuitionExempt ? "학생 등록" : "학생 등록과 수납"}
      description={
        form.tuitionExempt
          ? "수납 면제 학생은 결제 없이 등록합니다."
          : "신규 학생 등록과 첫 수납 기록을 한 번에 처리합니다."
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-[10px] border border-slate-200 bg-white p-5">
          <div>
            <p className="text-sm font-semibold text-slate-900">기존 학생 확인</p>
            <p className="mt-1 text-sm text-slate-500">
              이름이나 학번으로 먼저 검색해 중복 등록을 막습니다.
            </p>
          </div>

          <label className="relative mt-4 block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={form.search}
              onChange={(event) => setForm((current) => ({ ...current, search: event.target.value }))}
              className="w-full rounded-[10px] border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400"
              placeholder="이름 또는 학번 검색"
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
                  <span className="text-xs font-semibold text-amber-700">연장 등록으로 전환</span>
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
              <span className="mb-2 block text-sm font-medium text-slate-700">학번</span>
              <input
                value={form.studentNumber}
                onChange={(event) => setForm((current) => ({ ...current, studentNumber: event.target.value }))}
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
                조교나 장학생처럼 신규 등록 시 별도 결제를 받지 않아야 하는 학생이면 켜 두세요.
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
                placeholder="예: 조교, 장학생, 내부 운영 지원"
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
                    paymentAmount: nextPlan ? String(nextPlan.amount) : current.paymentAmount,
                    paymentNotes: nextPlan?.name ?? current.paymentNotes,
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
                onChange={(event) => setForm((current) => ({ ...current, courseStartDate: event.target.value }))}
                required
                className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">등록 금액</span>
              <input
                type="number"
                value={form.tuitionAmount}
                onChange={(event) => setForm((current) => ({ ...current, tuitionAmount: event.target.value }))}
                min="0"
                className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
              />
            </label>

            <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-700">예상 수강 종료일</p>
              <p className="mt-2 text-lg font-bold text-slate-950">{computedCourseEndDate ?? "자동 계산 없음"}</p>
              <p className="mt-1 text-xs text-slate-500">
                {selectedPlan?.durationDays ? `${selectedPlan.durationDays}일 기준 자동 계산` : "기간 자유 플랜"}
              </p>
            </div>
          </div>
        </section>

        {form.tuitionExempt ? (
          <section className="rounded-[10px] border border-sky-200 bg-sky-50 p-5">
            <p className="text-sm font-semibold text-sky-900">수납 없이 등록됩니다.</p>
            <p className="mt-2 text-sm leading-6 text-sky-800">
              면제 학생은 결제 기록을 만들지 않고 등록되며, 수납 현황의 미납 목록에서도 제외됩니다.
            </p>
          </section>
        ) : (
          <section className="rounded-[10px] border border-slate-200 bg-white p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">수납 유형</span>
                <select
                  value={form.paymentTypeId}
                  onChange={(event) => setForm((current) => ({ ...current, paymentTypeId: event.target.value }))}
                  required
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                >
                  <option value="">수납 유형 선택</option>
                  {paymentCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">결제일</span>
                <input
                  type="date"
                  value={form.paymentDate}
                  onChange={(event) => setForm((current) => ({ ...current, paymentDate: event.target.value }))}
                  required
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">결제 금액</span>
                <input
                  type="number"
                  value={form.paymentAmount}
                  onChange={(event) => setForm((current) => ({ ...current, paymentAmount: event.target.value }))}
                  min="1"
                  required
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">결제 수단</span>
                <PaymentMethodSelect
                  value={form.paymentMethod}
                  onChange={(value) => setForm((current) => ({ ...current, paymentMethod: value }))}
                  required
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-2 block text-sm font-medium text-slate-700">결제 메모</span>
                <textarea
                  value={form.paymentNotes}
                  onChange={(event) => setForm((current) => ({ ...current, paymentNotes: event.target.value }))}
                  rows={3}
                  className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                />
              </label>
            </div>
          </section>
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
  );
}
