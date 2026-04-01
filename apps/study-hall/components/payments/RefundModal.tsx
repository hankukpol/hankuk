"use client";

import { useState, useMemo } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/Modal";
import { StudentSearchCombobox } from "@/components/ui/StudentSearchCombobox";
import { PaymentMethodSelect } from "@/components/payments/PaymentMethodSelect";
import { getKstToday } from "@/components/payments/payment-client-helpers";
import { formatCurrency, formatPaymentMethod } from "@/lib/payment-meta";
import type { PaymentCategoryItem, PaymentItem } from "@/lib/services/payment.service";

type StudentOption = {
  id: string;
  name: string;
  studentNumber: string;
};

type RefundMode = "simple" | "card-full-cancel";

type RefundModalProps = {
  open: boolean;
  onClose: () => void;
  divisionSlug: string;
  /** null이면 모달 내에서 학생 검색 */
  student: StudentOption | null;
  students: StudentOption[];
  paymentCategories: PaymentCategoryItem[];
  /** 선택된 학생의 수납 기록 (student가 고정일 때), 또는 전체 */
  paymentRecords: PaymentItem[];
  onSuccess: () => void;
};

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
  const [mode, setMode] = useState<RefundMode>("simple");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("bank-transfer");
  const [refundNotes, setRefundNotes] = useState("");
  const [originalPaymentId, setOriginalPaymentId] = useState("");
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [rechargeCategoryId, setRechargeCategoryId] = useState("");
  const [rechargeNotes, setRechargeNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const today = getKstToday();

  const activeStudentId = fixedStudent?.id ?? selectedStudentId;
  const activeStudent = fixedStudent ?? students.find((s) => s.id === selectedStudentId) ?? null;

  const studentPayments = useMemo(
    () => paymentRecords.filter((p) => p.studentId === activeStudentId && p.amount > 0),
    [paymentRecords, activeStudentId],
  );

  const totalPaid = useMemo(
    () =>
      paymentRecords
        .filter((p) => p.studentId === activeStudentId && p.amount > 0)
        .reduce((s, p) => s + p.amount, 0),
    [paymentRecords, activeStudentId],
  );

  const totalRefunded = useMemo(
    () =>
      Math.abs(
        paymentRecords
          .filter((p) => p.studentId === activeStudentId && p.amount < 0)
          .reduce((s, p) => s + p.amount, 0),
      ),
    [paymentRecords, activeStudentId],
  );

  const refundableAmount = totalPaid - totalRefunded;

  const cardPayments = useMemo(
    () =>
      studentPayments.filter(
        (p) => p.method === "card" || p.method?.startsWith("card"),
      ),
    [studentPayments],
  );

  const selectedOriginalPayment = cardPayments.find((p) => p.id === originalPaymentId) ?? null;

  const refundCategory = paymentCategories.find((c) => c.name === "환불") ?? null;
  const nonRefundCategories = paymentCategories.filter((c) => c.name !== "환불");

  function resetForm() {
    if (!fixedStudent) setSelectedStudentId("");
    setMode("simple");
    setRefundAmount("");
    setRefundMethod("bank-transfer");
    setRefundNotes("");
    setOriginalPaymentId("");
    setRechargeAmount("");
    setRechargeCategoryId("");
    setRechargeNotes("");
  }

  function handleClose() {
    if (isSubmitting) return;
    resetForm();
    onClose();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeStudent) {
      toast.error("학생을 선택해 주세요.");
      return;
    }

    if (!refundCategory) {
      toast.error("환불 수납 유형이 없습니다. 관리자에게 문의하세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "simple") {
        const amount = parseInt(refundAmount.replaceAll(",", ""), 10);
        if (!amount || amount <= 0) {
          toast.error("환불 금액을 입력해 주세요.");
          setIsSubmitting(false);
          return;
        }

        if (amount > refundableAmount) {
          toast.error("환불 가능액을 초과할 수 없습니다.");
          setIsSubmitting(false);
          return;
        }

        const response = await fetch(`/api/${divisionSlug}/payments/refund`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "simple",
            studentId: activeStudent.id,
            refundPaymentTypeId: refundCategory.id,
            amount,
            paymentDate: today,
            method: refundMethod,
            notes: refundNotes || null,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "환불 처리에 실패했습니다.");
        }

        toast.success(`${formatCurrency(amount)}원 환불을 기록했습니다.`);
      } else {
        if (!selectedOriginalPayment) {
          toast.error("원결제를 선택해 주세요.");
          setIsSubmitting(false);
          return;
        }

        const rechargeAmountNum = parseInt(rechargeAmount.replaceAll(",", ""), 10);
        if (!rechargeAmountNum || rechargeAmountNum <= 0) {
          toast.error("재결제 금액을 입력해 주세요.");
          setIsSubmitting(false);
          return;
        }

        if (!rechargeCategoryId) {
          toast.error("재결제 수납 유형을 선택해 주세요.");
          setIsSubmitting(false);
          return;
        }

        if (rechargeAmountNum >= selectedOriginalPayment.amount) {
          toast.error("재결제 금액은 원결제 금액보다 작아야 합니다.");
          setIsSubmitting(false);
          return;
        }

        const netRefund = selectedOriginalPayment.amount - rechargeAmountNum;

        if (netRefund > refundableAmount) {
          toast.error("환불 가능액을 초과할 수 없습니다.");
          setIsSubmitting(false);
          return;
        }

        const response = await fetch(`/api/${divisionSlug}/payments/refund`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "card-full-cancel",
            studentId: activeStudent.id,
            refundPaymentTypeId: refundCategory.id,
            originalPaymentId: selectedOriginalPayment.id,
            rechargePaymentTypeId: rechargeCategoryId,
            rechargeAmount: rechargeAmountNum,
            paymentDate: today,
            refundNotes:
              refundNotes || `카드 전체취소 (원결제 ${formatDate(selectedOriginalPayment.paymentDate)})`,
            rechargeNotes: rechargeNotes || "카드 재결제 (공제 후)",
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "카드 환불 처리에 실패했습니다.");
        }

        toast.success(
          `카드 전체취소(-${formatCurrency(selectedOriginalPayment.amount)}원) + 재결제(+${formatCurrency(rechargeAmountNum)}원) 완료. 실환불액: ${formatCurrency(netRefund)}원`,
        );
      }

      resetForm();
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "환불 처리에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const parsedRefundAmount = parseInt(refundAmount.replaceAll(",", ""), 10) || 0;
  const exceedsRefundable = mode === "simple" && parsedRefundAmount > refundableAmount;
  const parsedRechargeAmount = parseInt(rechargeAmount.replaceAll(",", ""), 10) || 0;
  const netRefundAmount =
    selectedOriginalPayment && parsedRechargeAmount > 0
      ? selectedOriginalPayment.amount - parsedRechargeAmount
      : selectedOriginalPayment?.amount ?? 0;
  const exceedsCardRefundable =
    mode === "card-full-cancel" &&
    Boolean(selectedOriginalPayment) &&
    netRefundAmount > refundableAmount;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      badge="환불"
      title="환불 처리"
      description="학생의 환불 내역을 기록합니다."
      widthClassName="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* 학생 선택 */}
        {fixedStudent ? (
          <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm text-slate-500">대상 학생</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {fixedStudent.name}
              <span className="ml-2 text-xs font-normal text-slate-500">{fixedStudent.studentNumber}</span>
            </p>
          </div>
        ) : (
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">학생 선택</span>
            <StudentSearchCombobox
              students={students}
              value={selectedStudentId}
              onChange={setSelectedStudentId}
              placeholder="학생을 선택해 주세요"
            />
          </label>
        )}

        {/* 수납 요약 */}
        {activeStudent && (
          <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <p className="font-medium text-slate-700">기존 수납 요약</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-slate-600">
              <div>
                <p className="text-xs text-slate-400">총 납부</p>
                <p className="font-semibold text-slate-900">{formatCurrency(totalPaid)}원</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">기환불</p>
                <p className="font-semibold text-rose-600">{formatCurrency(totalRefunded)}원</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">환불 가능액</p>
                <p className="font-semibold text-slate-900">{formatCurrency(refundableAmount)}원</p>
              </div>
            </div>
          </div>
        )}

        {/* 환불 유형 선택 */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">환불 유형</legend>
          <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-slate-200 px-4 py-3 transition hover:bg-slate-50">
            <input
              type="radio"
              name="refundMode"
              value="simple"
              checked={mode === "simple"}
              onChange={() => setMode("simple")}
              className="h-4 w-4 accent-rose-600"
            />
            <div>
              <p className="text-sm font-medium text-slate-900">일반 환불</p>
              <p className="text-xs text-slate-500">현금, 계좌이체 등 부분 환불</p>
            </div>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-slate-200 px-4 py-3 transition hover:bg-slate-50">
            <input
              type="radio"
              name="refundMode"
              value="card-full-cancel"
              checked={mode === "card-full-cancel"}
              onChange={() => setMode("card-full-cancel")}
              className="h-4 w-4 accent-rose-600"
            />
            <div>
              <p className="text-sm font-medium text-slate-900">카드 전체취소 + 재결제</p>
              <p className="text-xs text-slate-500">카드 단말기에서 전체취소 후 공제금 제외한 금액 재결제</p>
            </div>
          </label>
        </fieldset>

        {/* 일반 환불 폼 */}
        {mode === "simple" && (
          <div className="space-y-4 rounded-[10px] border border-rose-200 bg-rose-50/50 p-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">환불 금액</span>
                <div className="flex items-center gap-0">
                  <span className="inline-flex h-[46px] items-center rounded-l-[10px] border border-r-0 border-slate-200 bg-rose-100 px-3 text-sm font-bold text-rose-700">
                    &minus;
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value.replace(/[^0-9,]/g, ""))}
                    className="w-full rounded-r-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                    placeholder="예: 150000"
                    required
                    disabled={isSubmitting}
                  />
                </div>
                {exceedsRefundable && (
                  <p className="mt-1.5 text-xs text-amber-600">
                    환불 가능액({formatCurrency(refundableAmount)}원)을 초과합니다.
                  </p>
                )}
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">환불 방법</span>
                <PaymentMethodSelect
                  value={refundMethod}
                  onChange={setRefundMethod}
                  required
                  disabled={isSubmitting}
                  selectClassName="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                  inputClassName="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">메모</span>
              <input
                type="text"
                value={refundNotes}
                onChange={(e) => setRefundNotes(e.target.value)}
                className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                placeholder="예: 이용 기간 미사용분 환불"
                disabled={isSubmitting}
              />
            </label>

            {parsedRefundAmount > 0 && (
              <div className="rounded-[10px] border border-rose-200 bg-white px-4 py-3 text-sm">
                <span className="text-slate-500">기록 내용:</span>{" "}
                <span className="font-semibold text-rose-700">환불 -{formatCurrency(parsedRefundAmount)}원</span>
                <span className="ml-2 text-slate-400">({formatPaymentMethod(refundMethod)})</span>
              </div>
            )}
          </div>
        )}

        {/* 카드 전체취소 + 재결제 폼 */}
        {mode === "card-full-cancel" && (
          <div className="space-y-4 rounded-[10px] border border-rose-200 bg-rose-50/50 p-4">
            {/* 원결제 선택 */}
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">원결제 선택 (카드 결제 건)</span>
              <select
                value={originalPaymentId}
                onChange={(e) => setOriginalPaymentId(e.target.value)}
                className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                required
                disabled={isSubmitting}
              >
                <option value="">카드 결제 건을 선택해 주세요</option>
                {cardPayments.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatDate(p.paymentDate)} · {p.paymentTypeName} · {formatCurrency(p.amount)}원
                  </option>
                ))}
              </select>
              {cardPayments.length === 0 && (
                <p className="mt-1.5 text-xs text-slate-500">카드 결제 기록이 없습니다.</p>
              )}
            </label>

            {selectedOriginalPayment && (
              <>
                {/* 전체취소 금액 (자동) */}
                <div className="rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm">
                  <span className="text-slate-500">카드 전체취소:</span>{" "}
                  <span className="font-bold text-rose-700">
                    -{formatCurrency(selectedOriginalPayment.amount)}원
                  </span>
                </div>

                {/* 재결제 금액 */}
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">재결제 금액</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={rechargeAmount}
                      onChange={(e) => setRechargeAmount(e.target.value.replace(/[^0-9,]/g, ""))}
                      className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                      placeholder="예: 150000"
                      required
                      disabled={isSubmitting}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-slate-700">재결제 수납 유형</span>
                    <select
                      value={rechargeCategoryId}
                      onChange={(e) => setRechargeCategoryId(e.target.value)}
                      className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                      required
                      disabled={isSubmitting}
                    >
                      <option value="">선택해 주세요</option>
                      {nonRefundCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">메모</span>
                  <input
                    type="text"
                    value={refundNotes}
                    onChange={(e) => setRefundNotes(e.target.value)}
                    className="w-full rounded-[10px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-slate-400"
                    placeholder="예: 중도 해지 공제 후 재결제"
                    disabled={isSubmitting}
                  />
                </label>

                {/* 결과 미리보기 */}
                {(() => {
                  return (
                    <div className="space-y-1 rounded-[10px] border border-rose-200 bg-white px-4 py-3 text-sm">
                      <p>
                        <span className="text-slate-500">1건:</span>{" "}
                        <span className="font-semibold text-rose-700">
                          환불 -{formatCurrency(selectedOriginalPayment.amount)}원
                        </span>
                        <span className="ml-2 text-slate-400">(카드 전체취소)</span>
                      </p>
                      {parsedRechargeAmount > 0 && (
                        <p>
                          <span className="text-slate-500">2건:</span>{" "}
                          <span className="font-semibold text-emerald-700">
                            +{formatCurrency(parsedRechargeAmount)}원
                          </span>
                          <span className="ml-2 text-slate-400">(카드 재결제)</span>
                        </p>
                      )}
                      {parsedRechargeAmount > 0 && netRefundAmount > 0 && (
                        <p className="border-t border-rose-200 pt-1 font-semibold text-slate-900">
                          실환불액: {formatCurrency(netRefundAmount)}원
                        </p>
                      )}
                      {exceedsCardRefundable ? (
                        <p className="border-t border-rose-200 pt-1 text-xs text-amber-600">
                          환불 가능액({formatCurrency(refundableAmount)}원)을 초과합니다.
                        </p>
                      ) : null}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* 버튼 */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !activeStudent || exceedsRefundable || exceedsCardRefundable}
            className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
          >
            {isSubmitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
            환불 처리 완료
          </button>
        </div>
      </form>
    </Modal>
  );
}
