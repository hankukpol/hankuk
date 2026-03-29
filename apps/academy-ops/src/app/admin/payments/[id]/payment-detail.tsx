"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  PaymentCategory,
  PaymentMethod,
  PaymentStatus,
  RefundStatus,
  RefundType,
} from "@prisma/client";
import {
  PAYMENT_CATEGORY_LABEL,
  PAYMENT_CATEGORY_COLOR,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_COLOR,
} from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  MAX_INSTALLMENT_COUNT,
  toInstallmentDateInputValue,
} from "@/lib/payments/installment-schedule";
import { RefundModal } from "@/components/payments/refund-modal";
import { ReceiptResendButton } from "./receipt-resend-button";

// ── label maps ───────────────────────────────────────────────────────────────

const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  PENDING: "승인 대기",
  APPROVED: "승인됨",
  REJECTED: "거절됨",
  COMPLETED: "완료",
  CANCELLED: "취소",
};

const REFUND_STATUS_COLOR: Record<RefundStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  APPROVED: "border-forest/30 bg-forest/10 text-forest",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
  COMPLETED: "border-forest/30 bg-forest/10 text-forest",
  CANCELLED: "border-ink/20 bg-ink/5 text-slate",
};

const REFUND_TYPE_LABEL: Record<RefundType, string> = {
  CARD_CANCEL: "카드취소",
  CASH: "현금환불",
  TRANSFER: "계좌이체",
  PARTIAL: "부분환불",
};

// ── types ────────────────────────────────────────────────────────────────────

export type RefundRecord = {
  id: string;
  refundType: RefundType;
  status: RefundStatus;
  amount: number;
  reason: string;
  rejectionReason: string | null;
  bankName: string | null;
  accountNo: string | null;
  accountHolder: string | null;
  processedAt: string;
};

export type PaymentItemRecord = {
  id: string;
  itemType: PaymentCategory;
  itemName: string;
  unitPrice: number;
  quantity: number;
  amount: number;
};

export type InstallmentRecord = {
  id: string;
  seq: number;
  amount: number;
  dueDate: string;
  paidAt: string | null;
};

type InstallmentEditorDraft = {
  key: string;
  amount: string;
  dueDate: string;
};

export type PaymentDetailData = {
  id: string;
  examNumber: string | null;
  enrollmentId: string | null;
  category: PaymentCategory;
  method: PaymentMethod;
  status: PaymentStatus;
  grossAmount: number;
  discountAmount: number;
  couponAmount: number;
  pointAmount: number;
  netAmount: number;
  note: string | null;
  cashReceiptNo: string | null;
  cashReceiptType: string | null;
  cashReceiptIssuedAt: string | null;
  processedAt: string;
  student:
    | {
        name: string;
        phone: string | null;
        enrollments?: Array<{
          id: string;
          label: string;
          status: string;
        }>;
      }
    | null;
  processor: { name: string };
  items: PaymentItemRecord[];
  refunds: RefundRecord[];
  installments: InstallmentRecord[];
};

// ── helper ───────────────────────────────────────────────────────────────────

function installmentStatusLabel(item: InstallmentRecord): {
  label: string;
  cls: string;
} {
  const now = new Date();
  if (item.paidAt) return { label: "납부완료", cls: "border-forest/30 bg-forest/10 text-forest" };
  if (new Date(item.dueDate) < now)
    return { label: "연체", cls: "border-red-200 bg-red-50 text-red-700" };
  return { label: "미납", cls: "border-amber-200 bg-amber-50 text-amber-800" };
}

function buildInstallmentEditorDrafts(items: InstallmentRecord[]): InstallmentEditorDraft[] {
  return items.map((item) => ({
    key: item.id,
    amount: String(item.amount),
    dueDate: toInstallmentDateInputValue(item.dueDate),
  }));
}

// ── component ────────────────────────────────────────────────────────────────

export function PaymentDetail({
  payment: initial,
  canManageInstallments = false,
}: {
  payment: PaymentDetailData;
  canManageInstallments?: boolean;
}) {
  const router = useRouter();
  const [payment, setPayment] = useState(initial);
  const [refundOpen, setRefundOpen] = useState(false);
  const [isSchedulePending, startScheduleTransition] = useTransition();
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleSuccess, setScheduleSuccess] = useState<string | null>(null);
  const [scheduleDrafts, setScheduleDrafts] = useState<InstallmentEditorDraft[]>(() =>
    buildInstallmentEditorDrafts(initial.installments.filter((installment) => installment.paidAt === null)),
  );

  const totalRefunded = payment.refunds.reduce((s, r) => s + r.amount, 0);
  const canRefund = payment.status === "APPROVED" || payment.status === "PARTIAL_REFUNDED";
  const paidInstallments = payment.installments.filter((installment) => installment.paidAt !== null);
  const unpaidInstallments = payment.installments.filter((installment) => installment.paidAt === null);
  const outstandingInstallmentAmount = unpaidInstallments.reduce((sum, installment) => sum + installment.amount, 0);
  const remainingInstallmentSlots = Math.max(MAX_INSTALLMENT_COUNT - paidInstallments.length, 0);

  async function handleRefundSuccess() {
    setRefundOpen(false);
    router.refresh();
    const res = await fetch(`/api/payments/${payment.id}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setPayment((current) => ({
        ...(data.payment as PaymentDetailData),
        student: data.payment?.student
          ? {
              ...data.payment.student,
              enrollments: current.student?.enrollments ?? data.payment.student.enrollments,
            }
          : current.student,
      }));
    }
  }

  function refreshScheduleDrafts(nextPayment: PaymentDetailData) {
    setScheduleDrafts(
      buildInstallmentEditorDrafts(
        nextPayment.installments.filter((installment) => installment.paidAt === null),
      ),
    );
  }

  function updateScheduleDraft(key: string, patch: Partial<InstallmentEditorDraft>) {
    setScheduleDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    );
  }

  function addScheduleDraft() {
    setScheduleDrafts((current) => {
      if (current.length >= remainingInstallmentSlots) return current;

      const baseValue = current[current.length - 1]?.dueDate;
      const baseDate = baseValue ? new Date(`${baseValue}T00:00:00+09:00`) : new Date();
      const nextDate = new Date(baseDate);
      nextDate.setMonth(nextDate.getMonth() + 1);

      return [
        ...current,
        {
          key: crypto.randomUUID(),
          amount: "",
          dueDate: toInstallmentDateInputValue(nextDate),
        },
      ];
    });
  }

  function removeScheduleDraft(key: string) {
    setScheduleDrafts((current) => (current.length <= 1 ? current : current.filter((draft) => draft.key !== key)));
  }

  async function reloadPaymentDetail() {
    const res = await fetch(`/api/payments/${payment.id}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error("수납 상세 정보를 다시 불러오지 못했습니다.");
    }

    const data = (await res.json()) as { payment: PaymentDetailData };
    const nextPayment: PaymentDetailData = {
      ...data.payment,
      student: data.payment.student
        ? {
            ...data.payment.student,
            enrollments: payment.student?.enrollments ?? data.payment.student.enrollments,
          }
        : payment.student,
    };
    setPayment(nextPayment);
    refreshScheduleDrafts(nextPayment);
    return nextPayment;
  }

  function handleScheduleSave() {
    setScheduleError(null);
    setScheduleSuccess(null);

    startScheduleTransition(async () => {
      try {
        const res = await fetch(`/api/payments/${payment.id}/installments`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            installments: scheduleDrafts.map((draft) => ({
              amount: Number(draft.amount.replace(/,/g, "").trim()),
              dueDate: draft.dueDate,
            })),
          }),
        });

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setScheduleError(data.error ?? "분납 일정 저장에 실패했습니다.");
          return;
        }

        await reloadPaymentDetail();
        router.refresh();
        setIsEditingSchedule(false);
        setScheduleSuccess("분납 일정이 저장되었습니다.");
      } catch (error) {
        setScheduleError(error instanceof Error ? error.message : "분납 일정 저장에 실패했습니다.");
      }
    });
  }

  const fieldClass = "flex justify-between py-2.5 border-b border-ink/5 last:border-0";
  const keyClass = "text-sm text-slate";
  const valClass = "text-sm font-medium text-ink text-right";

  const isCashOrTransfer = payment.method === "CASH" || payment.method === "TRANSFER";
  const draftTotal = scheduleDrafts.reduce((sum, draft) => {
    const numeric = Number(draft.amount.replace(/,/g, "").trim());
    return sum + (Number.isFinite(numeric) ? numeric : 0);
  }, 0);

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        {/* ── 결제 정보 ─────────────────────────────────────── */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-ink">결제 정보</h2>
          <div>
            {/* 학생 */}
            <div className={fieldClass}>
              <span className={keyClass}>학생</span>
              <span className={valClass}>
                {payment.student ? (
                  payment.examNumber ? (
                    <Link
                      href={`/admin/students/${payment.examNumber}`}
                      className="font-semibold text-forest underline-offset-2 hover:underline"
                    >
                      {payment.student.name}
                      <span className="ml-1 text-xs font-normal text-slate">
                        ({payment.examNumber})
                      </span>
                    </Link>
                  ) : (
                    <span>{payment.student.name}</span>
                  )
                ) : (
                  "비회원"
                )}
              </span>
            </div>

            {/* 연락처 */}
            {payment.student?.phone ? (
              <div className={fieldClass}>
                <span className={keyClass}>연락처</span>
                <span className={valClass}>{payment.student.phone}</span>
              </div>
            ) : null}

            {payment.student?.enrollments?.length ? (
              <div className={fieldClass}>
                <span className={keyClass}>수강내역</span>
                <span className={`${valClass} flex max-w-[260px] flex-wrap justify-end gap-2`}>
                  {payment.student.enrollments.map((enrollment) => (
                    <span
                      key={enrollment.id}
                      className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-2 py-0.5 text-xs font-semibold text-forest"
                    >
                      {enrollment.label} · {enrollment.status}
                    </span>
                  ))}
                </span>
              </div>
            ) : null}

            {/* 처리일시 */}
            <div className={fieldClass}>
              <span className={keyClass}>처리일시</span>
              <span className={valClass}>{formatDateTime(payment.processedAt)}</span>
            </div>

            {/* 처리자 */}
            <div className={fieldClass}>
              <span className={keyClass}>처리자</span>
              <span className={valClass}>{payment.processor.name}</span>
            </div>

            {/* 수납 유형 */}
            <div className={fieldClass}>
              <span className={keyClass}>수납 유형</span>
              <span className={valClass}>
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${PAYMENT_CATEGORY_COLOR[payment.category]}`}
                >
                  {PAYMENT_CATEGORY_LABEL[payment.category]}
                </span>
              </span>
            </div>

            {/* 결제 수단 */}
            <div className={fieldClass}>
              <span className={keyClass}>결제 수단</span>
              <span className={valClass}>{PAYMENT_METHOD_LABEL[payment.method]}</span>
            </div>

            {/* 상태 */}
            <div className={fieldClass}>
              <span className={keyClass}>상태</span>
              <span className={valClass}>
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${PAYMENT_STATUS_COLOR[payment.status]}`}
                >
                  {PAYMENT_STATUS_LABEL[payment.status]}
                </span>
              </span>
            </div>

            {/* 수납 금액 */}
            <div className={fieldClass}>
              <span className={keyClass}>수납 금액</span>
              <span className={valClass}>{payment.grossAmount.toLocaleString()}원</span>
            </div>

            {/* 할인 금액 */}
            {payment.discountAmount > 0 ? (
              <div className={fieldClass}>
                <span className={keyClass}>할인 금액</span>
                <span className="text-right text-sm font-medium text-red-600">
                  -{payment.discountAmount.toLocaleString()}원
                </span>
              </div>
            ) : null}

            {/* 쿠폰 할인 */}
            {payment.couponAmount > 0 ? (
              <div className={fieldClass}>
                <span className={keyClass}>쿠폰 할인</span>
                <span className="text-right text-sm font-medium text-red-600">
                  -{payment.couponAmount.toLocaleString()}원
                </span>
              </div>
            ) : null}

            {/* 포인트 사용 */}
            {payment.pointAmount > 0 ? (
              <div className={fieldClass}>
                <span className={keyClass}>포인트 사용</span>
                <span className="text-right text-sm font-medium text-red-600">
                  -{payment.pointAmount.toLocaleString()}원
                </span>
              </div>
            ) : null}

            {/* 실수납액 */}
            <div className={fieldClass}>
              <span className={keyClass}>실수납액</span>
              <span className="text-right text-sm font-bold text-forest">
                {payment.netAmount.toLocaleString()}원
              </span>
            </div>

            {/* 환불 합계 */}
            {totalRefunded > 0 ? (
              <div className={fieldClass}>
                <span className={keyClass}>환불 합계</span>
                <span className="text-right text-sm font-medium text-red-600">
                  -{totalRefunded.toLocaleString()}원
                </span>
              </div>
            ) : null}

            {/* 비고 */}
            {payment.note ? (
              <div className={fieldClass}>
                <span className={keyClass}>비고</span>
                <span className={`${valClass} max-w-[220px] break-words`}>{payment.note}</span>
              </div>
            ) : null}
          </div>

          {/* 환불 버튼 */}
          {canRefund ? (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setRefundOpen(true)}
                className="w-full rounded-full border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
              >
                환불 처리
              </button>
            </div>
          ) : null}
        </div>

        {/* ── 결제 항목 ─────────────────────────────────────── */}
        <div className="rounded-[28px] border border-ink/10 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-ink">결제 항목</h2>
          {payment.items.length === 0 ? (
            <p className="text-sm text-slate">항목 없음</p>
          ) : (
            <div className="space-y-2">
              {payment.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-2xl bg-mist/50 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{item.itemName}</p>
                    <p className="mt-0.5 text-xs text-slate">
                      {item.unitPrice.toLocaleString()}원 × {item.quantity}
                    </p>
                  </div>
                  <span className="tabular-nums text-sm font-semibold text-ink">
                    {item.amount.toLocaleString()}원
                  </span>
                </div>
              ))}

              {/* 합계 */}
              <div className="flex items-center justify-between rounded-2xl border border-forest/20 bg-forest/5 px-4 py-3">
                <span className="text-sm font-semibold text-forest">합계</span>
                <span className="tabular-nums text-sm font-bold text-forest">
                  {payment.items.reduce((s, i) => s + i.amount, 0).toLocaleString()}원
                </span>
              </div>
            </div>
          )}

          {/* 관련 수강 링크 */}
          {payment.enrollmentId ? (
            <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
              <p className="text-xs font-medium text-sky-700">연관 수강 신청</p>
              <Link
                href={`/admin/enrollments/${payment.enrollmentId}`}
                className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-800 underline-offset-2 hover:underline"
              >
                수강 상세 보기 →
              </Link>
            </div>
          ) : null}
        </div>

        {/* ── 현금영수증 ────────────────────────────────────────
            Only shown for CASH or TRANSFER payments.
            Spans both columns so it doesn't create an orphan column.        */}
        {isCashOrTransfer ? (
          <div className="rounded-[28px] border border-amber-200 bg-amber-50/40 p-6 md:col-span-2">
            <h2 className="mb-4 text-base font-semibold text-amber-800">현금영수증</h2>
            <div className="grid gap-0 md:max-w-md">
              {/* 발급 유형 */}
              <div className={fieldClass}>
                <span className={keyClass}>발급 유형</span>
                <span className={valClass}>
                  {payment.cashReceiptType === "INCOME_DEDUCTION" ? (
                    <span className="inline-flex rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                      소득공제
                    </span>
                  ) : payment.cashReceiptType === "EXPENSE_PROOF" ? (
                    <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
                      지출증빙
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full border border-ink/20 bg-ink/5 px-2 py-0.5 text-xs font-semibold text-slate">
                      미발급
                    </span>
                  )}
                </span>
              </div>

              {/* 승인번호 */}
              {payment.cashReceiptNo ? (
                <div className={fieldClass}>
                  <span className={keyClass}>승인번호</span>
                  <span className={`${valClass} font-mono tracking-wider`}>
                    {payment.cashReceiptNo}
                  </span>
                </div>
              ) : null}

              {/* 발급일시 */}
              {payment.cashReceiptIssuedAt ? (
                <div className={fieldClass}>
                  <span className={keyClass}>발급일시</span>
                  <span className={valClass}>{formatDateTime(payment.cashReceiptIssuedAt)}</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ── 분할납부 일정 ──────────────────────────────────── */}
        {payment.installments.length > 0 ? (
          <div className="rounded-[28px] border border-ink/10 bg-white p-6 md:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">분할납부 일정</h2>
                <p className="mt-1 text-xs text-slate">
                  이미 납부된 회차는 고정되고, 남은 미납 회차만 다시 편성할 수 있습니다.
                </p>
              </div>
              {canManageInstallments && unpaidInstallments.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingSchedule((current) => !current);
                    setScheduleError(null);
                    setScheduleSuccess(null);
                    refreshScheduleDrafts(payment);
                  }}
                  className="rounded-full border border-ember/20 bg-ember/5 px-4 py-2 text-sm font-semibold text-ember transition hover:border-ember/40 hover:bg-ember/10"
                >
                  {isEditingSchedule ? "편집 닫기" : "미납 회차 재편성"}
                </button>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead>
                  <tr>
                    {["회차", "예정일", "납부일", "금액", "상태", "관리"].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap bg-mist/50 px-4 py-2 text-left text-xs font-medium uppercase text-slate"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {payment.installments.map((inst) => {
                    const { label, cls } = installmentStatusLabel(inst);
                    return (
                      <tr key={inst.id} className="hover:bg-mist/30 transition">
                        <td className="px-4 py-3 tabular-nums font-medium text-ink">
                          {inst.seq}회
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate">
                          {formatDate(inst.dueDate)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate">
                          {inst.paidAt ? formatDate(inst.paidAt) : "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums font-semibold text-ink">
                          {inst.amount.toLocaleString()}원
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}
                          >
                            {label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <Link
                            href={`/admin/payments/installments/${inst.id}`}
                            className="font-medium text-forest underline-offset-2 hover:underline"
                          >
                            회차 상세
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {scheduleSuccess ? (
              <div
                aria-live="polite"
                className="mt-4 rounded-2xl border border-forest/20 bg-forest/10 px-4 py-3 text-sm text-forest"
              >
                {scheduleSuccess}
              </div>
            ) : null}
            {scheduleError ? (
              <div
                aria-live="polite"
                className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {scheduleError}
              </div>
            ) : null}

            {isEditingSchedule && canManageInstallments && unpaidInstallments.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-ink/10 bg-mist/20 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-ink">미납 회차 재편성</h3>
                    <p className="mt-1 text-xs text-slate">
                      기납부 {paidInstallments.length}회차는 유지되고, 남은 잔액 {outstandingInstallmentAmount.toLocaleString()}원을 다시 배분합니다.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => refreshScheduleDrafts(payment)}
                      className="rounded-full border border-ink/10 px-4 py-2 text-xs font-medium text-slate transition hover:border-ink/30 hover:text-ink"
                    >
                      초기화
                    </button>
                    <button
                      type="button"
                      onClick={addScheduleDraft}
                      disabled={scheduleDrafts.length >= remainingInstallmentSlots}
                      className="rounded-full border border-ink/10 px-4 py-2 text-xs font-medium text-slate transition hover:border-ink/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      + 회차 추가
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {scheduleDrafts.map((draft, index) => (
                    <div key={draft.key} className="rounded-2xl border border-ink/10 bg-white p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-medium text-ink">{paidInstallments.length + index + 1}회차</p>
                        {scheduleDrafts.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removeScheduleDraft(draft.key)}
                            className="text-xs font-medium text-red-600"
                          >
                            삭제
                          </button>
                        ) : null}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-sm">
                          <span className="text-xs font-medium text-slate">금액</span>
                          <input
                            value={draft.amount}
                            onChange={(event) => updateScheduleDraft(draft.key, { amount: event.target.value })}
                            inputMode="numeric"
                            placeholder="0"
                            className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none focus:border-ember/40"
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-xs font-medium text-slate">납부 예정일</span>
                          <input
                            type="date"
                            value={draft.dueDate}
                            onChange={(event) => updateScheduleDraft(draft.key, { dueDate: event.target.value })}
                            className="w-full rounded-2xl border border-ink/10 px-4 py-3 outline-none focus:border-ember/40"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-ink">재편성 합계 {draftTotal.toLocaleString()}원</p>
                    <p className={`mt-1 text-xs ${draftTotal === outstandingInstallmentAmount ? "text-forest" : "text-red-600"}`}>
                      {draftTotal === outstandingInstallmentAmount
                        ? "잔여 분납 금액과 일치합니다."
                        : "잔여 분납 금액과 일치하도록 조정해 주세요."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingSchedule(false);
                        setScheduleError(null);
                        setScheduleSuccess(null);
                        refreshScheduleDrafts(payment);
                      }}
                      className="rounded-full border border-ink/10 px-4 py-2 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={handleScheduleSave}
                      disabled={isSchedulePending}
                      className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white transition hover:bg-ember/90 disabled:opacity-60"
                    >
                      {isSchedulePending ? "저장 중..." : "분납 일정 저장"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ── 환불 내역 ─────────────────────────────────────── */}
        {payment.refunds.length > 0 ? (
          <div className="rounded-[28px] border border-red-100 bg-white p-6 md:col-span-2">
            <h2 className="mb-4 text-base font-semibold text-red-700">환불 내역</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ink/10 text-sm">
                <thead>
                  <tr>
                    {["처리일시", "상태", "유형", "금액", "사유", "계좌 정보"].map((h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap bg-mist/50 px-4 py-2 text-left text-xs font-medium uppercase text-slate"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {payment.refunds.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-slate">
                        {formatDateTime(r.processedAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${REFUND_STATUS_COLOR[r.status]}`}
                        >
                          {REFUND_STATUS_LABEL[r.status]}
                        </span>
                        {r.status === "REJECTED" && r.rejectionReason ? (
                          <p
                            className="mt-1 max-w-[140px] truncate text-xs text-red-600"
                            title={r.rejectionReason}
                          >
                            {r.rejectionReason}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                          {REFUND_TYPE_LABEL[r.refundType]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums font-semibold text-red-600">
                        -{r.amount.toLocaleString()}원
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-slate">{r.reason}</td>
                      <td className="px-4 py-3 text-xs text-slate">
                        {r.accountHolder
                          ? `${r.bankName ?? ""} ${r.accountNo ?? ""} (${r.accountHolder})`
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── 액션 버튼 ─────────────────────────────────────────── */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <a
          href="/admin/payments"
          className="inline-flex items-center gap-2 rounded-full border border-ink/10 px-5 py-2.5 text-sm font-medium text-slate transition hover:border-ink/30 hover:text-ink"
        >
          ← 목록으로
        </a>
        <Link
          href={`/admin/payments/${payment.id}/edit`}
          className="inline-flex items-center gap-2 rounded-full border border-ember/20 bg-ember/5 px-5 py-2.5 text-sm font-semibold text-ember transition hover:border-ember/50 hover:bg-ember/10"
        >
          수정
        </Link>
        {payment.examNumber ? (
          <ReceiptResendButton paymentId={payment.id} />
        ) : null}

        <a
          href={`/admin/payments/${payment.id}/receipt`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-forest/20 px-5 py-2.5 text-sm font-semibold text-forest transition hover:border-forest/50"
        >
          영수증 출력
        </a>
      </div>

      {/* ── 환불 모달 ─────────────────────────────────────────── */}
      <RefundModal
        open={refundOpen}
        paymentId={payment.id}
        studentName={payment.student?.name ?? null}
        netAmount={payment.netAmount}
        alreadyRefunded={totalRefunded}
        onClose={() => setRefundOpen(false)}
        onSuccess={handleRefundSuccess}
      />
    </>
  );
}
