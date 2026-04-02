"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/lib/sonner";

import { PaymentMethodSelect } from "@/components/payments/PaymentMethodSelect";
import { getKstToday } from "@/components/payments/payment-client-helpers";
import { Modal } from "@/components/ui/Modal";
import { StudentSearchCombobox } from "@/components/ui/StudentSearchCombobox";
import {
  formatCurrency,
  formatPaymentMethod,
  normalizePaymentMethodValue,
} from "@/lib/payment-meta";
import type { PaymentCategoryItem, PaymentItem } from "@/lib/services/payment.service";

type StudentOption = { id: string; name: string; studentNumber: string };
type RefundMode = "simple" | "card-full-cancel";
type RefundModalProps = {
  open: boolean;
  onClose: () => void;
  divisionSlug: string;
  student: StudentOption | null;
  students: StudentOption[];
  paymentCategories: PaymentCategoryItem[];
  paymentRecords: PaymentItem[];
  onSuccess: () => void | Promise<void>;
};

type PaymentChoice = PaymentItem & { refundedAmount: number; remainingAmount: number; isCardPayment: boolean };

function formatDate(value: string) {
  return new Date(`${value}T00:00:00+09:00`).toLocaleDateString("ko-KR");
}

export function RefundModal({
  open,
  onClose,
  divisionSlug,
  student: fixedStudent,
  students,
  paymentCategories,
  paymentRecords,
  onSuccess,
}: RefundModalProps) {
  const [selectedStudentId, setSelectedStudentId] = useState(fixedStudent?.id ?? "");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [originalPaymentId, setOriginalPaymentId] = useState("");
  const [mode, setMode] = useState<RefundMode>("simple");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("bank-transfer");
  const [refundNotes, setRefundNotes] = useState("");
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [rechargeCategoryId, setRechargeCategoryId] = useState("");
  const [rechargeNotes, setRechargeNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const today = getKstToday();
  const refundCategory = paymentCategories.find((category) => category.name === "환불") ?? null;
  const nonRefundCategories = paymentCategories.filter((category) => category.name !== "환불");
  const activeStudentId = fixedStudent?.id ?? selectedStudentId;
  const activeStudent = fixedStudent ?? students.find((student) => student.id === selectedStudentId) ?? null;

  const studentPayments = useMemo(
    () => paymentRecords.filter((payment) => payment.studentId === activeStudentId),
    [activeStudentId, paymentRecords],
  );

  const groupMap = useMemo(() => {
    const refundedByOriginalId = new Map<string, number>();
    studentPayments.forEach((payment) => {
      if (payment.originalPaymentId && payment.amount < 0) {
        refundedByOriginalId.set(
          payment.originalPaymentId,
          (refundedByOriginalId.get(payment.originalPaymentId) ?? 0) + Math.abs(payment.amount),
        );
      }
    });

    const groups = new Map<string, PaymentChoice[]>();
    studentPayments
      .filter((payment) => payment.amount > 0)
      .sort((left, right) => right.paymentDate.localeCompare(left.paymentDate) || right.createdAt.localeCompare(left.createdAt))
      .forEach((payment) => {
        const choice: PaymentChoice = {
          ...payment,
          refundedAmount: refundedByOriginalId.get(payment.id) ?? 0,
          remainingAmount: Math.max(payment.amount - (refundedByOriginalId.get(payment.id) ?? 0), 0),
          isCardPayment: normalizePaymentMethodValue(payment.method) === "card",
        };
        const groupId = payment.paymentGroupId ?? payment.id;
        groups.set(groupId, [...(groups.get(groupId) ?? []), choice]);
      });
    return groups;
  }, [studentPayments]);

  const paymentGroups = useMemo(() => Array.from(groupMap.entries()), [groupMap]);
  const selectedGroupPayments = groupMap.get(selectedGroupId) ?? [];
  const eligiblePayments = useMemo(
    () =>
      selectedGroupPayments.filter((payment) =>
        mode === "card-full-cancel"
          ? payment.isCardPayment && payment.refundedAmount === 0
          : payment.remainingAmount > 0,
      ),
    [mode, selectedGroupPayments],
  );
  const selectedPayment = eligiblePayments.find((payment) => payment.id === originalPaymentId) ?? null;
  const totalPaid = studentPayments.filter((payment) => payment.amount > 0).reduce((sum, payment) => sum + payment.amount, 0);
  const totalRefunded = Math.abs(studentPayments.filter((payment) => payment.amount < 0).reduce((sum, payment) => sum + payment.amount, 0));

  useEffect(() => {
    if (fixedStudent) {
      setSelectedStudentId(fixedStudent.id);
    }
  }, [fixedStudent]);

  useEffect(() => {
    if (!groupMap.has(selectedGroupId)) {
      setSelectedGroupId(paymentGroups[0]?.[0] ?? "");
    }
  }, [groupMap, paymentGroups, selectedGroupId]);

  useEffect(() => {
    if (!eligiblePayments.some((payment) => payment.id === originalPaymentId)) {
      setOriginalPaymentId(eligiblePayments[0]?.id ?? "");
    }
  }, [eligiblePayments, originalPaymentId]);

  useEffect(() => {
    if (mode === "card-full-cancel" && !rechargeCategoryId && selectedPayment) {
      setRechargeCategoryId(selectedPayment.paymentTypeId);
    }
  }, [mode, rechargeCategoryId, selectedPayment]);

  function resetForm() {
    if (!fixedStudent) {
      setSelectedStudentId("");
    }
    setSelectedGroupId("");
    setOriginalPaymentId("");
    setMode("simple");
    setRefundAmount("");
    setRefundMethod("bank-transfer");
    setRefundNotes("");
    setRechargeAmount("");
    setRechargeCategoryId("");
    setRechargeNotes("");
  }

  function handleClose() {
    if (isSubmitting) {
      return;
    }
    resetForm();
    onClose();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeStudent || !selectedPayment || !refundCategory) {
      toast.error("학생, 납부 묶음, 원결제를 확인해 주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "simple") {
        const amount = Number.parseInt(refundAmount.replaceAll(",", ""), 10) || 0;
        if (amount <= 0 || amount > selectedPayment.remainingAmount) {
          throw new Error(`환불 금액은 1원 이상 ${formatCurrency(selectedPayment.remainingAmount)}원 이하로 입력해 주세요.`);
        }

        const response = await fetch(`/api/${divisionSlug}/payments/refund`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "simple",
            studentId: activeStudent.id,
            refundPaymentTypeId: refundCategory.id,
            originalPaymentId: selectedPayment.id,
            amount,
            paymentDate: today,
            method: refundMethod,
            notes: refundNotes || null,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "환불 처리에 실패했습니다.");
      } else {
        const amount = Number.parseInt(rechargeAmount.replaceAll(",", ""), 10) || 0;
        if (!selectedPayment.isCardPayment) throw new Error("카드 결제만 전체취소할 수 있습니다.");
        if (amount <= 0 || amount >= selectedPayment.amount) {
          throw new Error("재결제 금액은 1원 이상이며 원결제 금액보다 작아야 합니다.");
        }
        if (!rechargeCategoryId) throw new Error("재결제 수납 유형을 선택해 주세요.");

        const response = await fetch(`/api/${divisionSlug}/payments/refund`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "card-full-cancel",
            studentId: activeStudent.id,
            refundPaymentTypeId: refundCategory.id,
            originalPaymentId: selectedPayment.id,
            rechargePaymentTypeId: rechargeCategoryId,
            rechargeAmount: amount,
            paymentDate: today,
            refundNotes: refundNotes || `카드 전체취소 (${formatDate(selectedPayment.paymentDate)})`,
            rechargeNotes: rechargeNotes || "카드 재결제 (공제 후)",
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "카드 환불 처리에 실패했습니다.");
      }

      resetForm();
      await onSuccess();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "환불 처리에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} badge="환불" title="환불 처리" description="납부 묶음 기준으로 환불을 처리합니다." widthClassName="max-w-3xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        {fixedStudent ? (
          <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="text-slate-500">대상 학생</p>
            <p className="mt-1 font-semibold text-slate-900">{fixedStudent.name} <span className="ml-2 text-xs font-normal text-slate-500">{fixedStudent.studentNumber}</span></p>
          </div>
        ) : (
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">학생 선택</span>
            <StudentSearchCombobox students={students} value={selectedStudentId} onChange={setSelectedStudentId} placeholder="학생을 선택해 주세요" />
          </label>
        )}

        {activeStudent ? (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><p className="text-xs text-slate-400">총 납부</p><p className="mt-1 font-semibold text-slate-900">{formatCurrency(totalPaid)}원</p></div>
            <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><p className="text-xs text-slate-400">기환불</p><p className="mt-1 font-semibold text-rose-600">{formatCurrency(totalRefunded)}원</p></div>
            <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm"><p className="text-xs text-slate-400">잔여 환불 가능액</p><p className="mt-1 font-semibold text-slate-900">{formatCurrency(Math.max(totalPaid - totalRefunded, 0))}원</p></div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">환불 방식</span>
            <select value={mode} onChange={(event) => setMode(event.target.value as RefundMode)} className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400">
              <option value="simple">일반 환불</option>
              <option value="card-full-cancel">카드 전체취소 + 재결제</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">납부 묶음</span>
            <select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)} disabled={!activeStudent || isSubmitting} className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400">
              {paymentGroups.length === 0 ? <option value="">납부 묶음 없음</option> : null}
              {paymentGroups.map(([groupId, payments]) => (
                <option key={groupId} value={groupId}>{`${formatDate(payments[0].paymentDate)} · ${payments.length}건 · ${formatCurrency(payments.reduce((sum, payment) => sum + payment.amount, 0))}원`}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-slate-700">원결제 선택</span>
          <select value={originalPaymentId} onChange={(event) => setOriginalPaymentId(event.target.value)} disabled={eligiblePayments.length === 0 || isSubmitting} className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400">
            <option value="">{mode === "card-full-cancel" ? "카드 원결제를 선택해 주세요" : "원결제를 선택해 주세요"}</option>
            {eligiblePayments.map((payment) => (
              <option key={payment.id} value={payment.id}>{`${formatDate(payment.paymentDate)} · ${payment.paymentTypeName} · ${formatPaymentMethod(payment.method)} · 결제 ${formatCurrency(payment.amount)}원 · 잔여 ${formatCurrency(payment.remainingAmount)}원`}</option>
            ))}
          </select>
        </label>

        {selectedGroupPayments.length > 0 ? (
          <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm">
            <p className="font-medium text-slate-700">묶음 결제 목록</p>
            <div className="mt-3 space-y-2">
              {selectedGroupPayments.map((payment) => (
                <div key={payment.id} className={`rounded-[10px] border px-3 py-3 ${payment.id === originalPaymentId ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"}`}>
                  <p className="font-medium text-slate-900">{payment.paymentTypeName}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatDate(payment.paymentDate)} · {formatPaymentMethod(payment.method)} · 결제 {formatCurrency(payment.amount)}원 · 기환불 {formatCurrency(payment.refundedAmount)}원 · 잔여 {formatCurrency(payment.remainingAmount)}원</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {mode === "simple" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">환불 금액</span>
              <input type="text" inputMode="numeric" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value.replace(/[^0-9,]/g, ""))} className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400" placeholder="예: 150000" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">환불 방법</span>
              <PaymentMethodSelect value={refundMethod} onChange={setRefundMethod} required disabled={isSubmitting} />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-2 block text-sm font-medium text-slate-700">메모</span>
              <input type="text" value={refundNotes} onChange={(event) => setRefundNotes(event.target.value)} className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400" placeholder="예: 이용 기간 미사용분 환불" />
            </label>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">재결제 금액</span>
              <input type="text" inputMode="numeric" value={rechargeAmount} onChange={(event) => setRechargeAmount(event.target.value.replace(/[^0-9,]/g, ""))} className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400" placeholder="예: 120000" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">재결제 수납 유형</span>
              <select value={rechargeCategoryId} onChange={(event) => setRechargeCategoryId(event.target.value)} className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400">
                <option value="">선택해 주세요</option>
                {nonRefundCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">환불 메모</span>
              <input type="text" value={refundNotes} onChange={(event) => setRefundNotes(event.target.value)} className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400" placeholder="예: 중도 해지 전체취소" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">재결제 메모</span>
              <input type="text" value={rechargeNotes} onChange={(event) => setRechargeNotes(event.target.value)} className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400" placeholder="예: 카드 재결제 (공제 후)" />
            </label>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={handleClose} disabled={isSubmitting} className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">취소</button>
          <button type="submit" disabled={isSubmitting || !selectedPayment || !refundCategory} className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-50">
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            환불 처리 완료
          </button>
        </div>
      </form>
    </Modal>
  );
}
